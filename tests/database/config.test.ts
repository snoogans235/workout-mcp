import assert from "node:assert/strict";
import { test } from "node:test";
import { requireDatabaseUrl } from "../../src/database/config.js";

test("accepts an explicit PostgreSQL connection URL", () => {
    const url = "postgresql://workout:example@127.0.0.1:55432/workout?sslmode=disable";
    assert.equal(requireDatabaseUrl(url), url);
});

test("rejects missing, malformed and fallback connection configuration without leaking it", () => {
    for (const value of [undefined, "", "secret", "mysql://user:secret@host/db", "postgresql://user:secret@host/",
        "postgresql://host/db", "postgresql://user:secret@host/db?host=other", "postgres://bad%zz@host/db",
        "postgres://user@host/%00", "postgres://user@host:65536/db", " postgres://user@host/db"]) {
        assert.throws(() => requireDatabaseUrl(value), error => {
            assert.ok(error instanceof Error);
            assert.match(error.message, /Set DATABASE_URL/);
            assert.doesNotMatch(error.message, /secret|other/);
            return true;
        });
    }
});

test("rejects a missing port before pg can select a destination from PGPORT", () => {
    assert.throws(
        () => requireDatabaseUrl("postgresql://user@127.0.0.1/selected_database"),
        /Set DATABASE_URL/,
    );
});
