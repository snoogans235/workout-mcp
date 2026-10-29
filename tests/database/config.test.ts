import assert from "node:assert/strict";
import { test } from "node:test";
import { Client } from "pg";
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

test("accepts an explicit passwordless socket destination shared by pg and Prisma", () => {
    const url = "postgresql://socket_user@localhost:55432/socket_db?host=%2Ftmp%2Fexample-socket";
    const client = new Client({ connectionString: requireDatabaseUrl(url) });
    assert.equal(client.host, "/tmp/example-socket");
    assert.equal(client.port, 55432);
    assert.equal(client.user, "socket_user");
    assert.equal(client.database, "socket_db");
});

test("rejects missing or ambiguous socket destinations before driver fallback", () => {
    for (const url of [
        "postgresql://user@localhost:55432/db?host=",
        "postgresql://user@localhost:55432/db?host=relative",
        "postgresql://user@localhost:55432/db?host=%2Ftmp&host=%2Fother",
        "postgresql://user@remote:55432/db?host=%2Ftmp",
        "postgresql://user@localhost/db?host=%2Ftmp",
        "postgresql://localhost:55432/db?host=%2Ftmp",
        "postgresql://user@localhost:55432/?host=%2Ftmp",
        "postgresql://user@localhost:55432/db?host=%2Ftmp%00",
        "postgresql://user@localhost:55432/db?host=%2Ftmp%zz",
        "postgresql://user@localhost:55432/db?host=%2Ftmp&port=5432",
        "postgresql://user@localhost:55432/db?host=%2Ftmp&user=other",
        "postgresql://user@localhost:55432/db?host=%2Ftmp&database=other",
        "postgresql://user@localhost:55432/db?host=%2F%2Fnetwork-share",
        "postgresql://user@localhost:55432/db?host=%2Ftmp%5Cother",
        "postgresql://user@localhost:55432/db?host=%2Ftmp%0Aother",
        "postgresql://user@localhost:55432/db?host=%2Ftmp&%68ost=%2Fother",
        "postgresql://user@localhost:55432/db?host=%2Ftmp&hostaddr=127.0.0.1",
        "postgresql://user@localhost:55432/db?host=%2Ftmp&service=other",
        "postgresql://user@localhost:55432/db?host=%2Ftmp&password=other",
        "postgresql://user@localhost:55432/db?host=%2Ftmp&dbname=other",
    ]) {
        assert.throws(() => requireDatabaseUrl(url), /Set DATABASE_URL/);
    }
});

test("explicit TCP and socket destinations take precedence over ambient pg defaults", () => {
    const defaults = { PGHOST: "/tmp/ambient-socket", PGPORT: "61234", PGUSER: "ambient_user", PGDATABASE: "ambient_db" };
    const original = Object.fromEntries(Object.keys(defaults).map(key => [key, process.env[key]]));
    try {
        Object.assign(process.env, defaults);
        for (const [url, host] of [
            ["postgresql://explicit_user@127.0.0.1:55432/explicit_db", "127.0.0.1"],
            ["postgresql://explicit_user@localhost:55432/explicit_db?host=%2Ftmp%2Fselected-socket", "/tmp/selected-socket"],
        ]) {
            const client = new Client({ connectionString: requireDatabaseUrl(url) });
            assert.equal(client.host, host);
            assert.equal(client.port, 55432);
            assert.equal(client.user, "explicit_user");
            assert.equal(client.database, "explicit_db");
        }
    } finally {
        for (const [key, value] of Object.entries(original)) {
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
        }
    }
});
