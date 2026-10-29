import assert from "node:assert/strict";
import { test } from "node:test";
import { createDatabase } from "../../src/database/index.js";
import { requireTestDatabaseName } from "../../scripts/integration/config.js";

test("each isolated database starts without shared fixture state and rolls back failed transactions", async () => {
    const url = process.env.DATABASE_URL;
    assert.ok(url);
    requireTestDatabaseName(decodeURIComponent(new URL(url).pathname.slice(1)));
    const database = createDatabase(url);
    try {
        await database.connect();
        const initial = await database.client.$queryRaw<Array<{ exists: string | null }>>`SELECT to_regclass('public.integration_probe')::text AS exists`;
        assert.equal(initial[0].exists, null);
        await database.client.$executeRaw`CREATE TABLE integration_probe (id int PRIMARY KEY)`;
        await assert.rejects(database.client.$transaction(async transaction => {
            await transaction.$executeRaw`INSERT INTO integration_probe VALUES (1)`;
            throw new Error("Deliberate rollback");
        }), /Deliberate rollback/);
        const count = await database.client.$queryRaw<Array<{ count: number }>>`SELECT count(*)::int AS count FROM integration_probe`;
        assert.equal(count[0].count, 0);
    } finally { await database.disconnect(); }
});
