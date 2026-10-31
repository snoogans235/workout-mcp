import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";

function isRunning(pid: number): boolean {
    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
}

for (const scenario of ["SIGINT", "SIGTERM", "timeout"] as const) {
    test(`tool reference ${scenario} removes a build descendant that ignores TERM`, async () => {
        const directory = await mkdtemp(join(tmpdir(), "workout-reference-cleanup-"));
        const marker = join(directory, "child.pid");
        await mkdir(join(directory, "scripts"));
        await mkdir(join(directory, "bin"));
        await copyFile("scripts/tool-reference.sh", join(directory, "scripts/tool-reference.sh"));
        await writeFile(join(directory, "resistant.mjs"), [
            "import { writeFileSync } from 'node:fs';",
            "process.on('SIGTERM', () => {});",
            `writeFileSync(${JSON.stringify(marker)}, String(process.pid));`,
            "setInterval(() => {}, 1000);",
        ].join("\n"));
        await writeFile(join(directory, "bin/npm"), [
            "#!/usr/bin/env bash",
            'node "$PWD/resistant.mjs" &',
            "wait",
            "",
        ].join("\n"), { mode: 0o755 });
        if (scenario === "timeout") {
            await writeFile(join(directory, "bin/sleep"), [
                "#!/usr/bin/env bash",
                'if [[ "$1" == 120 ]]; then exec /bin/sleep 0.5; fi',
                'exec /bin/sleep "$@"',
                "",
            ].join("\n"), { mode: 0o755 });
        }

        const child = spawn("bash", ["scripts/tool-reference.sh", "check"], {
            cwd: directory,
            env: { ...process.env, PATH: `${join(directory, "bin")}:${process.env.PATH}` },
            stdio: ["ignore", "pipe", "pipe"],
        });
        const exited = new Promise<number | null>((resolve, reject) => {
            child.once("error", reject);
            child.once("exit", resolve);
        });
        let descendant: number | undefined;
        let deadline: ReturnType<typeof setTimeout> | undefined;

        try {
            const readyUntil = Date.now() + 5000;
            while (Date.now() < readyUntil) {
                try {
                    descendant = Number(await readFile(marker, "utf8"));
                    break;
                } catch {
                    await delay(20);
                }
            }
            assert.ok(descendant, "build descendant must start before interruption");
            if (scenario !== "timeout") {
                child.kill(scenario);
            }
            const code = await Promise.race([
                exited,
                new Promise<never>((_resolve, reject) => {
                    deadline = setTimeout(() => reject(new Error("runner cleanup timed out")), 8000);
                }),
            ]);
            assert.equal(code, scenario === "SIGINT" ? 130 : 143);
            const stoppedUntil = Date.now() + 1000;
            while (isRunning(descendant) && Date.now() < stoppedUntil) {
                await delay(20);
            }
            assert.equal(isRunning(descendant), false, "owned TERM-resistant descendant must be removed");
        } finally {
            clearTimeout(deadline);
            if (descendant && isRunning(descendant)) {
                process.kill(descendant, "SIGKILL");
            }
            if (child.exitCode === null) {
                child.kill("SIGKILL");
            }
            await rm(directory, { recursive: true, force: true });
        }
    });
}
