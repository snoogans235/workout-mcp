import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { Pool } from "pg";
import { requireTestDatabaseName } from "../../scripts/integration/config.js";

test("follow-up migration removes user units while preserving populated identities and profiles", async () => {
    const url = process.env.DATABASE_URL;
    assert.ok(url);
    requireTestDatabaseName(decodeURIComponent(new URL(url).pathname.slice(1)));
    const pool = new Pool({ connectionString: url });
    const connection = await pool.connect();
    try {
        await connection.query("BEGIN");
        await connection.query('CREATE SCHEMA migration_fixture');
        await connection.query('SET LOCAL search_path TO migration_fixture');
        await connection.query(await readFile("prisma/migrations/20261105150000_identity/migration.sql", "utf8"));
        await connection.query(`INSERT INTO "User" ("id", "displayName", "timezone", "preferredWeightUnit", "updatedAt")
            VALUES ('00000000-0000-4000-8000-000000000001', 'Existing user', 'Europe/London', 'KG', CURRENT_TIMESTAMP)`);
        await connection.query(`INSERT INTO "ExternalIdentity" ("issuer", "subject", "userId")
            VALUES ('https://migration.example/', 'subject', '00000000-0000-4000-8000-000000000001')`);
        const before = await connection.query('SELECT "id", "displayName", "timezone", "createdAt", "updatedAt" FROM "User"');
        const identities = await connection.query('SELECT * FROM "ExternalIdentity"');
        await connection.query(await readFile("prisma/migrations/20261106120000_remove_user_weight_unit/migration.sql", "utf8"));
        assert.deepEqual((await connection.query('SELECT * FROM "User"')).rows, before.rows);
        assert.deepEqual((await connection.query('SELECT * FROM "ExternalIdentity"')).rows, identities.rows);
        assert.equal((await connection.query("SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'migration_fixture' AND t.typname = 'WeightUnit'")).rowCount, 0);
    } finally {
        await connection.query("ROLLBACK");
        connection.release();
        await pool.end();
    }
});
