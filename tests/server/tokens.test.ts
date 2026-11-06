import assert from "node:assert/strict";
import { test } from "node:test";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWTPayload } from "jose";
import { discoverAccessTokenVerifier, InvalidAccessToken, jwtAccessTokenVerifier, oauthConfiguration } from "../../src/authentication/tokens.js";

const configuration = { issuer: "https://issuer.example/", resource: "https://api.example" };

test("OAuth configuration preserves exact URLs and rejects unsafe or missing values", () => {
    assert.deepEqual(oauthConfiguration({ OAUTH_ISSUER: configuration.issuer, OAUTH_AUDIENCE: configuration.resource }), configuration);
    for (const issuer of [undefined, "", "http://issuer.example/", "https://user:secret@issuer.example/", "https://issuer.example/?secret=1"]) {
        assert.throws(() => oauthConfiguration({ OAUTH_ISSUER: issuer, OAUTH_AUDIENCE: configuration.resource }));
    }
});

test("RS256 verification requires exact identity, intended resource, signature and time claims", async () => {
    const { publicKey, privateKey } = await generateKeyPair("RS256");
    const jwk = { ...await exportJWK(publicKey), kid: "test-key", alg: "RS256", use: "sig" };
    const verify = jwtAccessTokenVerifier(configuration, createLocalJWKSet({ keys: [jwk] }));
    const now = Math.floor(Date.now() / 1000);
    const valid = { iss: configuration.issuer, sub: "subject-secret", aud: configuration.resource, exp: now + 60, scope: "workout:read workout:read" };
    const sign = (claims: JWTPayload) => new SignJWT(claims).setProtectedHeader({ alg: "RS256", kid: "test-key" }).sign(privateKey);
    const result = await verify(await sign(valid));
    assert.deepEqual(result, { issuer: configuration.issuer, subject: "subject-secret", scopes: ["workout:read"] });
    assert.ok(Object.isFrozen(result));
    assert.ok(Object.isFrozen(result.scopes));
    const { exp: _expiry, ...missingExpiry } = valid;
    for (const claims of [
        { ...valid, iss: "https://issuer.example" },
        { ...valid, aud: "client-id-token-audience" },
        { ...valid, exp: now - 1 },
        { ...valid, nbf: now + 60 },
        { ...valid, sub: " " },
        { ...valid, scope: ["workout:read"] },
        missingExpiry,
    ]) {
        await assert.rejects(() => sign(claims).then(verify), InvalidAccessToken);
    }
    const wrongKey = await generateKeyPair("RS256");
    const wrongSignature = await new SignJWT(valid).setProtectedHeader({ alg: "RS256", kid: "test-key" }).sign(wrongKey.privateKey);
    for (const token of [wrongSignature, "malformed-token-secret"]) {
        await assert.rejects(() => verify(token), error => {
            assert.ok(error instanceof InvalidAccessToken);
            assert.equal(error.message, "Invalid access token.");
            assert.equal(error.cause, undefined);
            return true;
        });
    }
});


test("discovered JWKS is cached and refreshes rotated keys without following token URLs", async context => {
    const first = await generateKeyPair("RS256");
    const rotated = await generateKeyPair("RS256");
    const firstJwk = { ...await exportJWK(first.publicKey), kid: "first" };
    const rotatedJwk = { ...await exportJWK(rotated.publicKey), kid: "rotated" };
    let clock = Date.now();
    context.mock.method(Date, "now", () => clock);
    const calls: string[] = [];
    context.mock.method(globalThis, "fetch", async (input: Parameters<typeof fetch>[0]) => {
        const url = String(input);
        calls.push(url);
        if (url.endsWith("openid-configuration")) {
            return Response.json({ issuer: configuration.issuer, jwks_uri: "https://keys.example/jwks" });
        }
        assert.equal(url, "https://keys.example/jwks");
        return Response.json({ keys: calls.length === 2 ? [firstJwk] : [rotatedJwk] });
    });
    const verify = await discoverAccessTokenVerifier(configuration);
    const claims = { iss: configuration.issuer, sub: "fixture", aud: configuration.resource, exp: Math.floor(clock / 1000) + 300 };
    const token = await new SignJWT(claims).setProtectedHeader({ alg: "RS256", kid: "first", jku: "https://attacker.example/jwks" }).sign(first.privateKey);
    assert.equal((await verify(token)).subject, "fixture");
    await verify(token);
    assert.deepEqual(calls, ["https://issuer.example/.well-known/openid-configuration", "https://keys.example/jwks"]);
    clock += 31_000;
    const replacement = await new SignJWT(claims).setProtectedHeader({ alg: "RS256", kid: "rotated" }).sign(rotated.privateKey);
    assert.equal((await verify(replacement)).subject, "fixture");
    assert.equal(calls.length, 3);
});

test("discovery rejects conflicting metadata and hides provider failures", async context => {
    for (const metadata of [
        { issuer: "https://other.example/", jwks_uri: "https://keys.example/jwks" },
        { issuer: configuration.issuer, jwks_uri: "http://keys.example/jwks" },
    ]) {
        context.mock.method(globalThis, "fetch", async () => Response.json(metadata));
        await assert.rejects(discoverAccessTokenVerifier(configuration), { message: "OAuth discovery is unavailable or invalid." });
        context.mock.restoreAll();
    }
    context.mock.method(globalThis, "fetch", async () => { throw new Error("provider-secret-sentinel"); });
    await assert.rejects(discoverAccessTokenVerifier(configuration), error => {
        assert.ok(error instanceof Error);
        assert.equal(error.message, "OAuth discovery is unavailable or invalid.");
        assert.equal(error.cause, undefined);
        return true;
    });
});
