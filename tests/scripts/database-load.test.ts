import assert from "node:assert/strict";
import { test } from "node:test";
import { loadConfiguration, validateArchive } from "../../scripts/database-load/config.js";

test("database load requires a dedicated exact local non-maintenance target", () => {
    const args = ["--file", "fixture.dump", "--target", "workouts"];
    const url = "postgresql://loader@127.0.0.1:55432/workouts";
    assert.equal(loadConfiguration(args, url).env.PGDATABASE, "workouts");
    assert.equal(loadConfiguration(args, "postgresql://loader@localhost:55432/workouts?host=%2Ftmp%2Fpostgres").env.PGHOST, "/tmp/postgres");
});

test("database load rejects invalid destinations and ambiguous arguments", () => {
    const args = ["--file", "fixture.dump", "--target", "workouts"];
    for (const url of [undefined, "", "postgresql://loader@remote:55432/workouts",
        "postgresql://loader@127.0.0.1:55432/other", "postgresql://loader@127.0.0.1/workouts",
        "postgresql://loader@127.0.0.1:55432/workouts?service=ambient"]) {
        assert.throws(() => loadConfiguration(args, url));
    }
    assert.throws(() => loadConfiguration([...args, "--target", "workouts"], "postgresql://loader@localhost:55432/workouts"));
    assert.throws(() => loadConfiguration(["--file", "fixture.dump", "--target", "postgres"], "postgresql://loader@localhost:55432/postgres"));
});

const header = "; Format: CUSTOM\n; Dumped from database version: 18.6\n; Dumped by pg_dump version: 18.6\n";

test("archive validation admits full public schema/data and rejects unsupported contents", () => {
    assert.deepEqual(validateArchive(header + "1; 0 1 TABLE public parent loader\n2; 0 1 TABLE DATA public parent loader\n"), { createsPublic: false });
    for (const entry of ["TABLE DATA public parent loader", "TABLE other parent loader", "EXTENSION - vector loader", "DATABASE - other loader"]) {
        assert.throws(() => validateArchive(header + `1; 0 1 ${entry}\n`));
    }
    assert.throws(() => validateArchive(header + "1; 0 1 TABLE public parent loader\n"));
    assert.throws(() => validateArchive(header));
    assert.throws(() => validateArchive("plain SQL"));
});

test("database load isolates explicit connection fields from ambient libpq settings", () => {
    const keys = ["PGHOST", "PGPORT", "PGDATABASE", "PGUSER", "PGPASSWORD", "PGSERVICE", "PGOPTIONS", "PGPASSFILE", "PGSSLMODE", "DATABASE_URL", "TEST_DATABASE_ADMIN_URL"];
    const saved = new Map(keys.map(key => [key, process.env[key]]));
    try {
        for (const key of keys) {
            process.env[key] = "ambient-private-sentinel";
        }
        const configuration = loadConfiguration(["--file", "fixture.dump", "--target", "workouts"],
            "postgresql://explicit_role:explicit_password@localhost:55432/workouts?host=%2Ftmp%2Fpostgres");
        assert.equal(configuration.env.PGHOST, "/tmp/postgres");
        assert.equal(configuration.env.PGPORT, "55432");
        assert.equal(configuration.env.PGUSER, "explicit_role");
        assert.equal(configuration.env.PGPASSWORD, "explicit_password");
        assert.equal(configuration.env.PGDATABASE, "workouts");
        assert.equal(configuration.env.PGPASSFILE, "/dev/null");
        assert.equal(configuration.env.PGSSLMODE, "disable");
        for (const key of ["PGSERVICE", "PGOPTIONS", "DATABASE_URL", "DATABASE_LOAD_URL", "TEST_DATABASE_ADMIN_URL"]) {
            assert.equal(configuration.env[key], undefined);
        }
    } finally {
        for (const [key, value] of saved) {
            if (value === undefined) {
                delete process.env[key];
            } else {
                process.env[key] = value;
            }
        }
    }
});

test("database load rejects all maintenance names, ambiguous selectors, and remote socket aliases", () => {
    for (const target of ["postgres", "template0", "template1", " workouts", "workouts ", "work\nouts", "a".repeat(64)]) {
        assert.throws(() => loadConfiguration(["--file", "fixture.dump", "--target", target],
            `postgresql://loader@127.0.0.1:55432/${encodeURIComponent(target)}`));
    }
    const args = ["--file", "fixture.dump", "--target", "workouts"];
    for (const query of ["host=%2Ftmp%2Fpostgres&host=%2Fother", "host=relative", "host=%2F%2Fremote", "dbname=other", "options=private", "sslmode=require"]) {
        assert.throws(() => loadConfiguration(args, `postgresql://loader@localhost:55432/workouts?${query}`));
    }
    for (const invalid of [[], ["--file", "x"], [...args, "--unknown", "x"], [...args, "--file", "other"]]) {
        assert.throws(() => loadConfiguration(invalid, "postgresql://loader@127.0.0.1:55432/workouts"));
    }
});

test("archive preflight rejects globals, extension dependencies, and unsupported PostgreSQL versions", () => {
    const full = "1; 0 1 TABLE public parent loader\n2; 0 1 TABLE DATA public parent loader\n";
    for (const entry of ["EXTENSION - hstore loader", "SCHEMA - outside loader", "TABLE outside child loader", "EVENT TRIGGER - audit loader", "SERVER - foreign loader", "BLOB - 123 loader"]) {
        assert.throws(() => validateArchive(header + full + `3; 0 1 ${entry}\n`));
    }
    assert.throws(() => validateArchive(header.replaceAll("18.6", "17.9") + full));
    assert.throws(() => validateArchive(header.replace("CUSTOM", "PLAIN") + full));
});

test("archive preflight rejects a mixed archive with one table's data omitted", () => {
    const mixed = "1; 0 1 TABLE public parent loader\n2; 0 1 TABLE DATA public parent loader\n3; 0 1 TABLE public child loader\n";
    assert.throws(() => validateArchive(header + mixed));
});
