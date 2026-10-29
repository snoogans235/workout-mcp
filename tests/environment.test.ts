import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

test("optional environment loading preserves exported values and tolerates a missing file", () => {
    const directory = mkdtempSync(join(tmpdir(), "workout-env-"));
    const file = join(directory, ".env");
    const moduleUrl = new URL("../src/environment.ts", import.meta.url).href;
    try {
        writeFileSync(file, "WORKOUT_ENV_CHECK=file\nWORKOUT_ENV_FILE_ONLY=loaded\n");
        const result = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", `
            import assert from "node:assert/strict";
            import { loadProjectEnv } from ${JSON.stringify(moduleUrl)};
            loadProjectEnv(new URL(${JSON.stringify(pathToFileURL(file).href)}));
            assert.equal(process.env.WORKOUT_ENV_CHECK, "exported");
            assert.equal(process.env.WORKOUT_ENV_FILE_ONLY, "loaded");
            loadProjectEnv(new URL(${JSON.stringify(pathToFileURL(join(directory, "missing")).href)}));
        `], { encoding: "utf8", env: { ...process.env, WORKOUT_ENV_CHECK: "exported" } });
        assert.equal(result.status, 0, result.stderr);
    } finally {
        rmSync(directory, { recursive: true, force: true });
    }
});

test("environment loading supports quoted values and preserves an exported empty value", () => {
    const directory = mkdtempSync(join(tmpdir(), "workout-env-"));
    const file = join(directory, ".env");
    const moduleUrl = new URL("../src/environment.ts", import.meta.url).href;
    try {
        writeFileSync(file, '  WORKOUT_ENV_QUOTED = "value with spaces # retained"\nWORKOUT_ENV_EMPTY=file\n');
        const result = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", `
            import assert from "node:assert/strict";
            import { loadProjectEnv } from ${JSON.stringify(moduleUrl)};
            loadProjectEnv(new URL(${JSON.stringify(pathToFileURL(file).href)}));
            assert.equal(process.env.WORKOUT_ENV_QUOTED, "value with spaces # retained");
            assert.equal(process.env.WORKOUT_ENV_EMPTY, "");
        `], { encoding: "utf8", env: { ...process.env, WORKOUT_ENV_EMPTY: "" } });
        assert.equal(result.status, 0, result.stderr);
    } finally {
        rmSync(directory, { recursive: true, force: true });
    }
});

test("environment file errors identify the action without exposing the path", () => {
    const directory = mkdtempSync(join(tmpdir(), "workout-env-private-"));
    const moduleUrl = new URL("../src/environment.ts", import.meta.url).href;
    try {
        const result = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", `
            import assert from "node:assert/strict";
            import { loadProjectEnv } from ${JSON.stringify(moduleUrl)};
            assert.throws(() => loadProjectEnv(new URL(${JSON.stringify(pathToFileURL(directory).href)})),
                { message: "Unable to load the project .env file. Check its permissions and format." });
        `], { encoding: "utf8" });
        assert.equal(result.status, 0, result.stderr);
        assert.equal(result.stdout, "");
    } finally {
        rmSync(directory, { recursive: true, force: true });
    }
});
