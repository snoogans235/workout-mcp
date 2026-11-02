import { spawn } from "node:child_process";
import { constants, createWriteStream } from "node:fs";
import { mkdtemp, open, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";
import { setTimeout as delay } from "node:timers/promises";
import { Client } from "pg";
import { loadProjectEnv } from "../src/environment.js";
import { loadConfiguration, validateArchive } from "./database-load/config.js";

let interrupted = 0;
let activePid: number | undefined;
let failureState: string | undefined;
const applicationName = `workout-load-${randomUUID()}`;

function signalOwned(signal: NodeJS.Signals): void {
    if (activePid) {
        try {
            process.kill(-activePid, signal);
        } catch { /* The owned process has already exited. */ }
    }
}

function interrupt(code: number): void {
    interrupted = code;
    signalOwned("SIGTERM");
}

const onInterrupt = () => interrupt(130);
const onTerminate = () => interrupt(143);
process.on("SIGINT", onInterrupt);
process.on("SIGTERM", onTerminate);

async function run(command: string, args: string[], env: NodeJS.ProcessEnv): Promise<string> {
    if (interrupted) {
        throw new Error("Interrupted.");
    }
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, { env, detached: true, stdio: ["ignore", "pipe", "pipe"] });
        activePid = child.pid;
        let output = "";
        const deadline = setTimeout(() => {
            interrupted ||= 1;
            signalOwned("SIGTERM");
        }, 300_000);
        const escalation = setInterval(() => {
            if (interrupted) {
                signalOwned("SIGKILL");
            }
        }, 3000);
        child.stdout.on("data", (chunk: Buffer) => {
            output += chunk.toString();
        });
        let diagnostics = "";
        child.stderr.on("data", (chunk: Buffer) => {
            if (command === "psql") {
                diagnostics = (diagnostics + chunk.toString()).slice(-4096);
            }
        });
        child.once("error", () => {
            clearTimeout(deadline);
            clearInterval(escalation);
            activePid = undefined;
            reject(new Error("PostgreSQL tool could not run."));
        });
        child.once("close", code => {
            clearTimeout(deadline);
            clearInterval(escalation);
            activePid = undefined;
            if (code !== 0 || interrupted) {
                failureState = /ERROR:\s+([A-Z0-9]{5})\b/.exec(diagnostics)?.[1];
                reject(new Error("PostgreSQL operation failed."));
            } else {
                resolve(output);
            }
        });
    });
}

async function backendStopped(env: NodeJS.ProcessEnv): Promise<void> {
    const client = new Client({
        host: env.PGHOST,
        port: Number(env.PGPORT),
        user: env.PGUSER,
        password: env.PGPASSWORD ?? "",
        database: env.PGDATABASE,
        ssl: false,
        application_name: `${applicationName}-monitor`,
        connectionTimeoutMillis: 5000,
        query_timeout: 5000,
    });
    try {
        await client.connect();
        for (let attempt = 0; attempt < 50; attempt++) {
            const active = await client.query<{ pid: number }>(
                "SELECT pid FROM pg_stat_activity WHERE datname=current_database() AND application_name=$1 AND pid<>pg_backend_pid()", [applicationName]);
            if (active.rowCount === 0) {
                return;
            }
            if (interrupted) {
                for (const row of active.rows) {
                    await client.query("SELECT pg_cancel_backend($1)", [row.pid]);
                }
            }
            await delay(100);
        }
        throw new Error("Owned restore backend has not finished rollback.");
    } finally {
        await client.end();
    }
}

async function main(): Promise<void> {
    loadProjectEnv();
    const configuration = loadConfiguration(process.argv.slice(2), process.env.DATABASE_LOAD_URL);
    configuration.env.PGAPPNAME = applicationName;
    for (const command of ["pg_restore", "psql"]) {
        if (!new RegExp(`^${command} \\(PostgreSQL\\) 18\\.`).test(await run(command, ["--version"], configuration.env))) {
            throw new Error("Requires PostgreSQL 18 tools.");
        }
    }
    const directory = await mkdtemp(join(tmpdir(), "workout-database-load-"));
    let restorationStarted = false;
    try {
        const archive = join(directory, "archive.dump");
        const input = await open(configuration.file, constants.O_RDONLY | constants.O_NOFOLLOW);
        try {
            if (!(await input.stat()).isFile()) {
                throw new Error("Archive must be a readable regular file.");
            }
            await pipeline(input.createReadStream({ autoClose: false }), createWriteStream(archive, { flags: "wx", mode: 0o600 }));
        } finally {
            await input.close();
        }
        const contents = await run("pg_restore", ["--format=custom", "--list", archive], configuration.env);
        validateArchive(contents);
        const restored = join(directory, "restore.sql");
        await run("pg_restore", ["--format=custom", "--no-owner", "--no-acl", "--no-tablespaces", "--file", restored, archive], configuration.env);
        const reset = fileURLToPath(new URL("./database-load/reset.sql", import.meta.url));
        const expected = Buffer.from(configuration.target).toString("hex");
        restorationStarted = true;
        try {
            await run("psql", ["-X", "--no-password", "--quiet", "--single-transaction", "--set=ON_ERROR_STOP=1", "--set=VERBOSITY=sqlstate", "--set=SHOW_CONTEXT=never", `--set=expected_database_hex=${expected}`, "--file", reset, "--file", restored], configuration.env);
        } finally {
            await backendStopped(configuration.env);
        }
        console.log("Local database replacement committed successfully.");
    } finally {
        await rm(directory, { recursive: true, force: true });
        if (interrupted && restorationStarted) {
            console.error("Interrupted database load; owned restore connection closed.");
        }
    }
}

try {
    await main();
} catch {
    if (failureState) {
        console.error(`PostgreSQL SQLSTATE: ${failureState}`);
    }
    console.error("Database load failed. Verify the explicit local target, PostgreSQL 18 archive/tools, stopped application, and required permissions. No SQL or connection values are logged.");
    process.exitCode = interrupted || 1;
} finally {
    process.off("SIGINT", onInterrupt);
    process.off("SIGTERM", onTerminate);
}
