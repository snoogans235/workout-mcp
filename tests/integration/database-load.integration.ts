import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";
import { Client } from "pg";
import { requireTestDatabaseName } from "../../scripts/integration/config.js";
import { loadConfiguration, validateArchive } from "../../scripts/database-load/config.js";

const privateValue = "private-restore-row-sentinel";

test("local replacement preserves supplied state and rolls back rejected, failed, and interrupted loads", { timeout: 120_000 }, async () => {
    const url = process.env.DATABASE_URL;
    assert.ok(url);
    const target = requireTestDatabaseName(decodeURIComponent(new URL(url).pathname.slice(1)));
    const directory = await mkdtemp(join(tmpdir(), "workout-load-test-"));
    const owned = new Set<ReturnType<typeof spawn>>();
    const env = loadConfiguration(["--file", "unused", "--target", target], url).env;
    const monitorDatabase = process.env.TEST_DATABASE_MONITOR_DATABASE;
    assert.ok(monitorDatabase, "isolated runner must select its existing administrative database for monitoring");
    const monitorUrl = new URL(url);
    monitorUrl.pathname = `/${encodeURIComponent(monitorDatabase)}`;
    const query = async (sql: string, monitoring = false) => {
        const client = new Client({ connectionString: monitoring ? monitorUrl.href : url });
        try {
            await client.connect();
            return await client.query(sql);
        } finally {
            await client.end();
        }
    };
    const command = (executable: string, args: string[], environment = env) => {
        const child = spawn(executable, args, { env: environment, stdio: ["ignore", "pipe", "pipe"] });
        owned.add(child);
        let output = "";
        child.stdout.on("data", chunk => { output += String(chunk); });
        child.stderr.on("data", chunk => { output += String(chunk); });
        const completed = new Promise<{ code: number | null; output: string }>((resolve, reject) => {
            child.once("error", reject);
            child.once("close", code => {
                owned.delete(child);
                resolve({ code, output });
            });
        });
        return { child, completed };
    };
    const dump = async (name: string, options: string[] = []) => {
        const file = join(directory, `${name}.dump`);
        const result = await command("pg_dump", ["--format=custom", "--file", file, ...options]).completed;
        assert.equal(result.code, 0, "synthetic archive creation must succeed");
        if (name === "dataset-a" || name === "dataset-b") {
            const listed = await command("pg_restore", ["--list", file]).completed;
            assert.equal(listed.code, 0);
            validateArchive(listed.output);
        }
        return file;
    };
    const load = (file: string, overrides: NodeJS.ProcessEnv = {}, expected = target) => command(process.execPath, [
        "--import", "tsx", "scripts/database-load.ts", "--file", file, "--target", expected,
    ], { ...process.env, DATABASE_LOAD_URL: url, ...overrides });
    const safe = (output: string) => {
        assert.doesNotMatch(output, /private-restore-row-sentinel|private-password-sentinel|postgres(?:ql)?:\/\//);
        assert.doesNotMatch(output, /CREATE TABLE|COPY public|INSERT INTO/);
    };
    const fingerprint = async () => {
        const tables = (await query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows;
        const columns = (await query("SELECT table_name,column_name,data_type,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position")).rows;
        const constraints = (await query("SELECT conname,pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE connamespace='public'::regnamespace ORDER BY conname")).rows;
        const parent = (await query("SELECT * FROM private_parent ORDER BY id")).rows;
        const child = (await query("SELECT * FROM private_child ORDER BY id")).rows;
        const sequence = (await query("SELECT last_value,is_called FROM private_child_id_seq")).rows;
        return JSON.stringify({ tables, columns, constraints, parent, child, sequence });
    };
    const schema = async (revision: string, guard = "true") => {
        await query(`DROP SCHEMA public CASCADE; CREATE SCHEMA public;
            CREATE FUNCTION public.restore_guard() RETURNS boolean LANGUAGE plpgsql AS $fn$
            BEGIN ${guard === "sleep" ? "IF current_setting('application_name') LIKE 'workout-load-%' THEN PERFORM pg_sleep(30); END IF; RETURN true;" : `RETURN ${guard};`} END $fn$;
            CREATE TABLE private_parent (id uuid PRIMARY KEY, value text NOT NULL${revision === "B" ? ", revision text NOT NULL DEFAULT 'B'" : ""});
            CREATE TABLE private_child (id serial PRIMARY KEY, parent_id uuid NOT NULL REFERENCES private_parent(id), details jsonb NOT NULL,
                amount int CONSTRAINT positive_amount CHECK (amount>0), CONSTRAINT restore_guard_check CHECK (restore_guard()));
            INSERT INTO private_parent(id,value) VALUES ('00000000-0000-4000-8000-000000000001','${privateValue}-${revision}');
            INSERT INTO private_child(parent_id,details,amount) VALUES ('00000000-0000-4000-8000-000000000001','{"reps":8,"nested":{"unit":"kg"}}',${revision === "B" ? 7 : 3});
            SELECT setval('private_child_id_seq',41,true);`);
    };

    try {
        await schema("A");
        const archiveA = await dump("dataset-a");
        await schema("B");
        const archiveB = await dump("dataset-b");
        const digest = createHash("sha256").update(await readFile(archiveB)).digest("hex");
        await query("DROP SCHEMA public CASCADE; CREATE SCHEMA public");
        let result = await command("npm", ["run", "database:load", "--", "--file", archiveA, "--target", target], {
            ...process.env,
            DATABASE_LOAD_URL: url,
        }).completed;
        assert.equal(result.code, 0, result.output);
        safe(result.output);
        assert.equal((await query("SELECT amount FROM private_child")).rows[0].amount, 3);
        assert.deepEqual((await query("SELECT details FROM private_child")).rows[0].details, { reps: 8, nested: { unit: "kg" } });
        assert.equal((await query("SELECT nextval('private_child_id_seq')::int AS next")).rows[0].next, 42);
        await assert.rejects(query("INSERT INTO private_child(parent_id,details,amount) VALUES ('00000000-0000-4000-8000-000000000002','{}',1)"));
        await assert.rejects(query("INSERT INTO private_child(parent_id,details,amount) VALUES ('00000000-0000-4000-8000-000000000001','{}',0)"));
        await query("CREATE TABLE target_only (id int); INSERT INTO target_only VALUES (1)");
        result = await load(archiveB).completed;
        assert.equal(result.code, 0, result.output);
        assert.equal((await query("SELECT to_regclass('public.target_only') AS name")).rows[0].name, null);
        assert.equal((await query("SELECT revision FROM private_parent")).rows[0].revision, "B");
        assert.equal((await query("SELECT amount FROM private_child")).rows[0].amount, 7);
        const stateB = await fingerprint();
        for (const expected of [`${target}_other`, "local'; DROP SCHEMA public CASCADE; --"]) {
            const guarded = await command("psql", [
                "-X", "--no-password", "--quiet", "--single-transaction", "--set=ON_ERROR_STOP=1",
                "--set=VERBOSITY=sqlstate", `--set=expected_database_hex=${Buffer.from(expected).toString("hex")}`,
                "--file", "scripts/database-load/reset.sql",
            ]).completed;
            assert.notEqual(guarded.code, 0, "reset guard must reject mismatched and SQL-like names as literal values");
            assert.equal(await fingerprint(), stateB);
        }
        const credentialUrl = new URL(url);
        credentialUrl.password = "private-password-sentinel";
        result = await load(archiveB, { DATABASE_LOAD_URL: credentialUrl.href }).completed;
        assert.equal(result.code, 0);
        safe(result.output);
        assert.equal(await fingerprint(), stateB, "repeated replacement must be identical");

        const application = new Client({ connectionString: url });
        try {
            await application.connect();
            result = await load(archiveB).completed;
            assert.notEqual(result.code, 0, "running application connection must prevent replacement");
            safe(result.output);
            assert.equal((await application.query("SELECT 1 AS alive")).rows[0].alive, 1,
                "loader must not terminate another client's session");
        } finally {
            await application.end();
        }
        assert.equal(await fingerprint(), stateB);

        const unsupported = [await dump("data-only", ["--data-only"]), await dump("schema-only", ["--schema-only"])];
        const plain = join(directory, "plain.sql");
        await writeFile(plain, `SELECT '${privateValue}';`);
        unsupported.push(plain);
        await query("CREATE SCHEMA outside_app; CREATE TABLE outside_app.other (id int)");
        unsupported.push(await dump("other-namespace"));
        result = await load(archiveB).completed;
        assert.notEqual(result.code, 0, "unsupported target namespace must fail");
        assert.equal(await fingerprint(), stateB);
        await query("DROP SCHEMA outside_app CASCADE");
        await query("CREATE EXTENSION hstore");
        unsupported.push(await dump("extension-dependent"));
        result = await load(archiveB).completed;
        assert.notEqual(result.code, 0, "unsupported target extension must fail");
        safe(result.output);
        assert.equal(await fingerprint(), stateB);
        await query("DROP EXTENSION hstore");
        for (const file of unsupported) {
            result = await load(file).completed;
            assert.notEqual(result.code, 0);
            safe(result.output);
            assert.equal(await fingerprint(), stateB);
        }
        for (const [value, expected] of [
            ["", target], [url.replace(/\/[^/?]+(?=\?|$)/, "/postgres"), "postgres"],
            [url, `${target}_mismatch`], [url.replace(/localhost|127\.0\.0\.1/, "remote.invalid"), target],
        ]) {
            result = await load(archiveB, { DATABASE_LOAD_URL: value }, expected).completed;
            assert.notEqual(result.code, 0);
            safe(result.output);
            assert.equal(await fingerprint(), stateB);
        }

        await schema("A", "current_setting('application_name') NOT LIKE 'workout-load-%'");
        const failing = await dump("fails-during-copy");
        await load(archiveB).completed;
        result = await load(failing).completed;
        assert.notEqual(result.code, 0, "COPY check failure must reject after reset has begun");
        assert.match(result.output, /PostgreSQL SQLSTATE: 23514/,
            "failure must be the restored table's CHECK constraint, not an earlier preflight rejection");
        safe(result.output);
        assert.equal(await fingerprint(), stateB, "restore failure must restore schema/data/constraints/sequence");

        await schema("A", "sleep");
        const slow = await dump("interrupt-during-copy");
        await load(archiveB).completed;
        for (const signal of ["SIGINT", "SIGTERM"] as const) {
            const operation = load(slow, { PGPASSWORD: "private-password-sentinel" });
            let loading = false;
            const deadline = Date.now() + 15_000;
            while (Date.now() < deadline) {
                const active = await query(`SELECT pid FROM pg_stat_activity WHERE datname='${target}' AND application_name LIKE 'workout-load-%' AND wait_event='PgSleep'`, true);
                if (active.rowCount) {
                    loading = true;
                    break;
                }
                await delay(30);
            }
            assert.ok(loading, "interrupt must occur during COPY after transactional reset");
            operation.child.kill(signal);
            result = await operation.completed;
            assert.equal(result.code, signal === "SIGINT" ? 130 : 143);
            safe(result.output);
            assert.equal(await fingerprint(), stateB, "interruption must finish rollback before returning");
            assert.equal((await query(`SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname='${target}' AND application_name LIKE 'workout-load-%'`, true)).rows[0].count, 0);
        }
        assert.equal(createHash("sha256").update(await readFile(archiveB)).digest("hex"), digest);
        assert.deepEqual((await readdir(directory)).sort(), ["data-only.dump", "dataset-a.dump", "dataset-b.dump", "extension-dependent.dump", "fails-during-copy.dump", "interrupt-during-copy.dump", "other-namespace.dump", "plain.sql", "schema-only.dump"]);
    } finally {
        await Promise.all([...owned].map(child => new Promise<void>(resolve => {
            child.once("close", () => { resolve(); });
            child.kill("SIGTERM");
        })));
        await rm(directory, { recursive: true, force: true });
    }
});
