import assert from "node:assert/strict";
import { test } from "node:test";
import { artifactRequired, requireAdminUrl, requireTestDatabaseName, testDatabaseUrl } from "../scripts/integration/config.js";

test("cleanup rejects caller database names and partial test-prefix matches", () => {
    for (const name of ["postgres", "development", "workout_mcp_test_", "workout_mcp_test_unsafe", "workout_mcp_test_" + "a".repeat(32) + ";DROP DATABASE postgres"]) {
        assert.throws(() => requireTestDatabaseName(name), /Refusing/);
    }
});

test("derives only a generated database from explicit admin configuration", () => {
    const admin = "postgresql://test_admin@localhost:55432/postgres?host=%2Ftmp%2Ftest-socket";
    const name = "workout_mcp_test_" + "a".repeat(32);
    const derived = new URL(testDatabaseUrl(admin, name));
    assert.equal(derived.pathname, `/${name}`);
    assert.equal(derived.searchParams.get("host"), "/tmp/test-socket");
    assert.throws(() => requireAdminUrl(undefined), /TEST_DATABASE_ADMIN_URL/);
    assert.throws(() => requireAdminUrl(derived.href), /TEST_DATABASE_ADMIN_URL/);
});

test("artifact selection follows off, failure-only, and always semantics", () => {
    for (const [mode, success, failure] of [["off", false, false], ["on-failure", false, true], ["always", true, true]] as const) {
        assert.equal(artifactRequired(mode, 0), success);
        assert.equal(artifactRequired(mode, 1), failure);
    }
    assert.throws(() => artifactRequired("unexpected", 1), /TEST_DB_ARTIFACT/);
});
