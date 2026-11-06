import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { test } from "node:test";
import { createDatabase } from "../../src/database/index.js";
import { bootstrapLocalUser, LOCAL_USER_ID, resolveUser } from "../../src/identity/users.js";
import { requireTestDatabaseName } from "../../scripts/integration/config.js";
import { createAuthentication } from "../../src/authentication/runtime.js";

const profile = { displayName: "Test user", timezone: "America/Indiana/Indianapolis" };

test("authentication provisions neutral first-login preferences and preserves returning changes", async () => {
    const url = process.env.DATABASE_URL;
    assert.ok(url);
    requireTestDatabaseName(decodeURIComponent(new URL(url).pathname.slice(1)));
    const authentication = createAuthentication({ DATABASE_URL: url, OAUTH_ISSUER: "https://jit.example/", OAUTH_AUDIENCE: "https://api.example" });
    const database = createDatabase(url);
    const identity = { issuer: "https://jit.example/", subject: "first-login", scopes: [] };
    let createdUserId: string | undefined;
    try {
        const first = await authentication.resolveUser(identity);
        createdUserId = first.id;
        const user = await database.client.user.findUniqueOrThrow({ where: { id: first.id } });
        assert.equal(user.displayName, "Workout user");
        assert.equal(user.timezone, "UTC");
        assert.notEqual(user.id, LOCAL_USER_ID);
        await database.client.user.update({ where: { id: user.id }, data: { displayName: "Chosen", timezone: "Europe/London" } });
        const returning = await authentication.resolveUser(identity);
        assert.equal(returning.id, user.id);
        const updated = await database.client.user.findUniqueOrThrow({ where: { id: user.id } });
        assert.equal(updated.displayName, "Chosen");
        assert.equal(updated.timezone, "Europe/London");
    } finally {
        // Keep this fixture independent of the existing migration row-count assertions.
        await database.client.externalIdentity.deleteMany({ where: { issuer: identity.issuer } });
        if (createdUserId) {
            await database.client.user.deleteMany({ where: { id: createdUserId } });
        }
        await authentication.close();
        await database.disconnect();
    }
});

test("identity migration and persistence preserve unique owners and atomic creation", async () => {
    const url = process.env.DATABASE_URL;
    assert.ok(url);
    requireTestDatabaseName(decodeURIComponent(new URL(url).pathname.slice(1)));
    const database = createDatabase(url);
    const client = database.client;
    try {
        await database.connect();
        const identity = { issuer: "https://issuer.example/", subject: "subject-a" };
        await assert.rejects(resolveUser(client, identity), /requires an initial user profile/);
        assert.equal(await client.user.count(), 0);
        const first = await resolveUser(client, identity, profile);
        assert.equal(first.timezone, profile.timezone);
        assert.equal(first.displayName, profile.displayName);
        const returning = await resolveUser(client, identity, { displayName: "Changed", timezone: "UTC" });
        assert.deepEqual(returning, first, "returning login must not overwrite preferences or timestamps");
        assert.equal((await resolveUser(client, identity)).id, first.id);

        const second = await resolveUser(client, { ...identity, subject: "subject-b" }, profile);
        const otherIssuer = await resolveUser(client, { ...identity, issuer: "https://other.example/" }, profile);
        assert.equal(new Set([first.id, second.id, otherIssuer.id]).size, 3);
        const race = { issuer: identity.issuer, subject: "concurrent" };
        const resolutions = await Promise.all(Array.from({ length: 8 }, () => resolveUser(client, race, profile)));
        assert.equal(new Set(resolutions.map(user => user.id)).size, 1);
        assert.equal(await client.user.count(), 4, "concurrent losing inserts leave no orphan users");
        assert.equal(await client.externalIdentity.count(), 4);

        await assert.rejects(client.externalIdentity.create({
            data: { ...identity, user: { create: profile } },
        }));
        assert.equal(await client.user.count(), 4, "duplicate mapping must roll back nested user insertion");
        await assert.rejects(client.externalIdentity.create({
            data: { issuer: identity.issuer, subject: "link-attempt", userId: first.id },
        }));
        assert.equal(await client.externalIdentity.count(), 4, "account linking must be rejected");
        await assert.rejects(client.user.delete({ where: { id: first.id } }));
        assert.ok(await client.user.findUnique({ where: { id: first.id } }));
        await assert.rejects(client.externalIdentity.create({
            data: { issuer: identity.issuer, subject: "missing-owner", userId: "00000000-0000-4000-8000-000000000099" },
        }));
        assert.equal(await client.externalIdentity.count(), 4);

        const modelSuppliedIdentity = { ...identity, email: "same@example.test", userId: second.id };
        await assert.rejects(resolveUser(client, modelSuppliedIdentity, profile), /Verified identity/);
        const removedUnitProfile = { ...profile, preferredWeightUnit: "KG" };
        await assert.rejects(resolveUser(client, { ...identity, subject: "removed-user-unit" }, removedUnitProfile), /Initial user profile/);
        const badProfile = { ...profile, email: "same@example.test", userId: second.id };
        await assert.rejects(resolveUser(client, { ...identity, subject: "new" }, badProfile), /Initial user profile/);
        await assert.rejects(resolveUser(client, { ...identity, subject: " " }, profile), /Verified identity/);
        await assert.rejects(resolveUser(client, { ...identity, subject: "bad-zone" }, { ...profile, timezone: "invalid/timezone" }), /Initial user profile/);
        assert.equal(await client.user.count(), 4);

        const environment = { ...process.env };
        delete environment.LOCAL_USER_DISPLAY_NAME;
        delete environment.LOCAL_USER_TIMEZONE;
        const command = await promisify(execFile)(process.execPath, ["--import", "tsx", "scripts/bootstrap-local-user.ts"], { env: environment });
        assert.match(command.stdout, /Local bootstrap user is available/);
        const local = await bootstrapLocalUser(client, { displayName: "local", timezone: profile.timezone });
        assert.equal(local.displayName, "local");
        assert.equal(local.timezone, profile.timezone);
        assert.equal(local.id, LOCAL_USER_ID);
        assert.deepEqual(await bootstrapLocalUser(client, { displayName: "changed", timezone: "UTC" }), local);
        assert.equal(await client.externalIdentity.count({ where: { userId: local.id } }), 0);
        assert.equal(await client.user.count(), 5);
        assert.notEqual(local.id, first.id, "bootstrap user is never selected by a verified external identity");
    } finally {
        await database.disconnect();
    }
});

test("identity keys remain exact and existing profiles survive returning resolution", async () => {
    const database = createDatabase(process.env.DATABASE_URL);
    try {
        await database.connect();
        const identity = { issuer: "https://exact.example/", subject: "CaseSensitive" };
        const first = await resolveUser(database.client, identity, { ...profile });
        const otherIssuer = await resolveUser(database.client, { ...identity, issuer: "https://exact.example" }, profile);
        const otherSubject = await resolveUser(database.client, { ...identity, subject: "casesensitive" }, profile);
        assert.equal(new Set([first.id, otherIssuer.id, otherSubject.id]).size, 3);

        assert.deepEqual(await resolveUser(database.client, identity), first);
        const before = await database.client.externalIdentity.count();
        for (const invalid of [{ issuer: " ", subject: "blank-issuer" }, { issuer: identity.issuer, subject: " " }]) {
            await assert.rejects(database.client.externalIdentity.create({ data: { ...invalid, user: { create: profile } } }));
        }
        assert.equal(await database.client.externalIdentity.count(), before);
        await assert.rejects(database.client.user.update({
            where: { id: first.id }, data: { id: "00000000-0000-4000-8000-000000000088" },
        }));
        assert.equal((await resolveUser(database.client, identity)).id, first.id);
    } finally {
        await database.disconnect();
    }
});
