import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { createDatabase } from "../../src/database/index.js";

test("requires explicit configuration before constructing a database", () => {
    assert.throws(() => createDatabase(undefined), /Set DATABASE_URL/);
});

test("constructs one reusable client without connecting and closes an unused pool", async () => {
    const database = createDatabase("postgresql://user@127.0.0.1:1/unreachable");
    const client = database.client;
    assert.equal(database.client, client);
    await database.disconnect();
});

test("importing and constructing the database attempts no network connections", () => {
    const result = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", `
        import assert from "node:assert/strict";
        import { Socket } from "node:net";
        let connections = 0;
        Socket.prototype.connect = function () {
            connections++;
            throw new Error("Unexpected network connection");
        };
        const { createDatabase } = await import("./src/database/index.ts");
        const database = createDatabase("postgresql://user@127.0.0.1:1/unreachable");
        await database.disconnect();
        assert.equal(connections, 0);
    `], { encoding: "utf8", env: { ...process.env, DATABASE_URL: "invalid" } });

    assert.equal(result.status, 0, result.stderr);
});
