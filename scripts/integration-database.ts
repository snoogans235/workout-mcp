import { spawn, spawnSync } from "node:child_process";
import { constants, closeSync, existsSync, fstatSync, lstatSync, mkdirSync, openSync, readdirSync, realpathSync, chmodSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";
import { loadProjectEnv } from "../src/environment.js";
import { artifactRequired, requireAdminUrl, requireTestDatabaseName, testDatabaseUrl } from "./integration/config.js";

const root = fileURLToPath(new URL("../", import.meta.url));
process.chdir(root);
loadProjectEnv();
const [operation, name = "", status = "1"] = process.argv.slice(2);
const mode = process.env.TEST_DB_ARTIFACT ?? "off";
const owner = process.env.TEST_DB_RUN_OWNER;

function requireOwner(): string {
    if (!owner || !/^[a-f0-9]{32}$/.test(owner)) throw new Error("Missing generated run ownership token.");
    return `workout_mcp_test_owner:${owner}`;
}

async function owned(client: Client): Promise<boolean> {
    const result = await client.query("SELECT shobj_description(oid, 'pg_database') AS owner FROM pg_database WHERE datname=$1", [name]);
    if (!result.rowCount) return false;
    if (result.rows[0].owner !== requireOwner()) throw new Error("Refusing a test database owned by another run.");
    return true;
}

async function withAdmin(action: (client: Client) => Promise<void>): Promise<void> {
    const client = new Client({ connectionString: requireAdminUrl(process.env.TEST_DATABASE_ADMIN_URL), connectionTimeoutMillis: 5000 });
    try { await client.connect(); await action(client); }
    finally { await client.end(); }
}

async function child(command: string, args: string[], url: string): Promise<number> {
    const env: NodeJS.ProcessEnv = { ...process.env, DATABASE_URL: url };
    delete env.TEST_DATABASE_ADMIN_URL;
    delete env.TEST_DB_RUN_OWNER;
    // Buffer output so secrets split across chunks cannot evade replacement.
    return new Promise<number>((done, reject) => {
        const processChild = spawn(command, args, { env, detached: true, stdio: ["ignore", "pipe", "pipe"] });
        let stdout = "", stderr = "";
        const redact = (value: string) => {
            const password = new URL(url).password;
            for (const secret of [url, process.env.TEST_DATABASE_ADMIN_URL, password, decodeURIComponent(password)]) {
                if (secret) value = value.split(secret).join("[redacted]");
            }
            return value.replace(/postgres(?:ql)?:\/\/[^\s'"<>]+/gi, "[redacted PostgreSQL URL]");
        };
        const signal = () => {
            const pid = processChild.pid;
            if (pid) {
                try { process.kill(-pid, "SIGTERM"); } catch { /* already exited */ }
                setTimeout(() => { try { process.kill(-pid, "SIGKILL"); } catch { /* exited */ } }, 3000).unref();
            }
        };
        process.on("SIGTERM", signal); process.on("SIGINT", signal);
        processChild.stdout.on("data", chunk => { stdout += chunk; });
        processChild.stderr.on("data", chunk => { stderr += chunk; });
        processChild.on("error", reject);
        processChild.on("close", (code, termination) => {
            process.off("SIGTERM", signal); process.off("SIGINT", signal);
            process.stdout.write(redact(stdout)); process.stderr.write(redact(stderr));
            done(code ?? (termination === "SIGINT" ? 130 : 143));
        });
    });
}

async function main(): Promise<void> {
    artifactRequired(mode, 0);
    const adminUrl = requireAdminUrl(process.env.TEST_DATABASE_ADMIN_URL);
    if (operation === "preflight") {
        await withAdmin(async client => {
            const { rows } = await client.query("SELECT current_setting('server_version_num')::int AS version, rolcreatedb OR rolsuper AS can_create FROM pg_roles WHERE rolname=current_user");
            if (Math.floor(rows[0].version / 10000) !== 18 || !rows[0].can_create) throw new Error("Requires PostgreSQL 18 and database creation privileges.");
        });
        console.log("PostgreSQL 18 administrative configuration verified.");
        return;
    }
    requireTestDatabaseName(name);
    const marker = requireOwner();
    if (operation === "create") {
        // Finish the create acknowledgement before Bash can start cleanup.
        // Otherwise an interrupted client could race DROP against an in-flight CREATE.
        process.on("SIGTERM", () => { process.exitCode = 143; });
        process.on("SIGINT", () => { process.exitCode = 130; });
        await withAdmin(async client => {
            await client.query(`CREATE DATABASE "${name}" TEMPLATE template0`);
            await client.query(`COMMENT ON DATABASE "${name}" IS '${marker}'`);
        });
        console.log(`Created isolated database ${name}.`);
    } else if (operation === "drop") {
        await withAdmin(async client => { if (await owned(client)) await client.query(`DROP DATABASE "${name}" WITH (FORCE)`); });
        console.log(`Removed isolated database ${name}.`);
    } else if (operation === "run") {
        await withAdmin(async client => { if (!await owned(client)) throw new Error("Generated database is missing."); });
        const url = testDatabaseUrl(adminUrl, name);
        const directory = join(root, "prisma/migrations");
        const migrations = existsSync(directory) ? readdirSync(directory).filter(entry => existsSync(join(directory, entry, "migration.sql"))).sort() : [];
        if (migrations.length) {
            console.log(`Applying reviewed migrations: ${migrations.join(", ")}`);
            const result = await child("bash", ["scripts/prisma-migrate.sh", "deploy"], url);
            if (result !== 0) { process.exitCode = result; return; }
        } else console.log("No reviewed migrations checked in; this run proves connection, transaction, and isolation behavior only.");
        const files = readdirSync(join(root, "tests/integration")).filter(file => file.endsWith(".integration.ts")).sort();
        if (!files.length) throw new Error("No integration tests found.");
        process.exitCode = await child(process.execPath, ["--import", "tsx", "--test", ...files.map(file => `tests/integration/${file}`)], url);
    } else if (operation === "artifact") {
        if (!artifactRequired(mode, Number(status))) return;
        await withAdmin(async client => { if (!await owned(client)) throw new Error("Generated database is missing."); });
        const directory = join(root, ".local/test-artifacts");
        mkdirSync(directory, { recursive: true, mode: 0o700 });
        if (realpathSync(directory) !== resolve(directory)) throw new Error("Artifact directory must not be a symbolic link.");
        chmodSync(directory, 0o700);
        const path = join(directory, `${name}.dump`);
        // libpq tools take explicit connection fields, never a URL in argv/logs.
        const url = new URL(testDatabaseUrl(adminUrl, name));
        const env: NodeJS.ProcessEnv = { ...process.env };
        for (const key of Object.keys(env)) if (key.startsWith("PG")) delete env[key];
        Object.assign(env, {
            PGHOST: url.searchParams.get("host") ?? url.hostname.replace(/^\[|\]$/g, ""),
            PGPORT: url.port, PGUSER: decodeURIComponent(url.username),
            PGPASSWORD: decodeURIComponent(url.password), PGDATABASE: name,
        });
        for (const [parameter, variable] of [["sslmode", "PGSSLMODE"], ["sslrootcert", "PGSSLROOTCERT"], ["sslcert", "PGSSLCERT"], ["sslkey", "PGSSLKEY"]]) {
            const value = url.searchParams.get(parameter);
            if (value) env[variable] = value;
        }
        delete env.TEST_DATABASE_ADMIN_URL; delete env.DATABASE_URL;
        // Reserve exclusively and pass the open descriptor: pg_dump must never
        // reopen a caller-precreated path or follow a symlink to another file.
        const output = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
        const reserved = fstatSync(output);
        const sameFile = (file: ReturnType<typeof fstatSync>) => file.isFile() && file.dev === reserved.dev && file.ino === reserved.ino;
        let dumped = false;
        try {
            dumped = spawnSync("pg_dump", ["--format=custom", "--no-owner", "--no-acl"], {
                env, stdio: ["ignore", output, "pipe"], timeout: 30000,
            }).status === 0;
        } finally { closeSync(output); }
        try {
            if (!dumped) throw new Error("Test artifact dump failed.");
            const input = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
            try {
                if (!sameFile(fstatSync(input))) throw new Error("Test artifact file was replaced.");
                const list = spawnSync("pg_restore", ["--list", "--no-owner", "--no-acl"], {
                    stdio: [input, "pipe", "pipe"], timeout: 30000,
                });
                if (list.status !== 0 || !sameFile(lstatSync(path))) throw new Error("Test artifact validation failed.");
            } finally { closeSync(input); }
        } catch (error) {
            // Remove only the file this invocation reserved, never a replacement.
            try { if (sameFile(lstatSync(path))) rmSync(path); } catch { /* already removed */ }
            throw error;
        }
        console.log(`Validated test artifact .local/test-artifacts/${name}.dump (restore with --no-owner --no-acl).`);
    } else throw new Error("Unknown integration runner operation.");
}

try { await main(); }
catch {
    console.error(`Integration database ${operation || "configuration"} failed. Check explicit admin configuration, privileges, and PostgreSQL tools; no connection values are logged.`);
    process.exitCode = 1;
}
