import assert from "node:assert/strict";
import { createServer } from "node:http";
import { Writable } from "node:stream";
import { test } from "node:test";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { McpServer } from "@modelcontextprotocol/server";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { z } from "zod";
import { authenticatedRequest, type Authentication } from "../../src/authentication/requests.js";
import { jwtAccessTokenVerifier } from "../../src/authentication/tokens.js";
import { createLogger } from "../../src/diagnostics/logger.js";
import { createApplication } from "../../src/server/application.js";
import { ToolRegistrar } from "../../src/server/tools/tool-registrar.js";

test("HTTP auth rejects invalid tokens before handlers and supplies only immutable resolved ownership", async () => {
    const configuration = { issuer: "https://issuer.example/", resource: "https://api.example" };
    const keys = await generateKeyPair("RS256");
    const verify = jwtAccessTokenVerifier(configuration, createLocalJWKSet({ keys: [{ ...await exportJWK(keys.publicKey), kid: "fixture" }] }));
    const now = Math.floor(Date.now() / 1000);
    const valid = { iss: configuration.issuer, sub: "private-subject-sentinel", aud: configuration.resource, exp: now + 60, scope: "workout:read" };
    const sign = (claims: Record<string, unknown>) => new SignJWT(claims).setProtectedHeader({ alg: "RS256", kid: "fixture" }).sign(keys.privateKey);
    let logs = "";
    const stream = new Writable({ write(chunk, _encoding, callback) { logs += chunk; callback(); } });
    let resolutions = 0;
    let executions = 0;
    const authentication: Authentication = {
        configuration, verify,
        resolveUser: async identity => {
            resolutions++;
            assert.equal(identity.subject, valid.sub);
            return { id: "resolved-owner" };
        },
        close: async () => {},
    };
    const application = createApplication({ authentication, logger: createLogger("info", stream), serverFactory: () => {
        const server = new McpServer({ name: "auth-fixture", version: "1" });
        new ToolRegistrar(server).registerTool("probe", { inputSchema: z.object({ userId: z.string().optional() }) }, () => {
            executions++;
            const context = authenticatedRequest();
            assert.ok(Object.isFrozen(context));
            assert.ok(Object.isFrozen(context.scopes));
            return { content: [{ type: "text", text: JSON.stringify(context) }] };
        });
        return server;
    } });
    const listener = createServer(application.app);
    await new Promise<void>(resolve => listener.listen(0, "127.0.0.1", resolve));
    const address = listener.address();
    assert.ok(address && typeof address !== "string");
    const url = new URL(`http://127.0.0.1:${address.port}/mcp`);
    const client = new Client({ name: "verification", version: "1" }, { versionNegotiation: { mode: { pin: "2026-07-28" } } });
    try {
        const metadata = await fetch(new URL("/.well-known/oauth-protected-resource", url));
        assert.deepEqual(await metadata.json(), { resource: configuration.resource, authorization_servers: [configuration.issuer], bearer_methods_supported: ["header"] });
        const invalidClaims = [
            { ...valid, exp: now - 1 }, { ...valid, iss: "https://issuer.example" },
            { ...valid, aud: "id-token-client" }, { ...valid, sub: "" }, { ...valid, nbf: now + 60 },
        ];
        const otherKeys = await generateKeyPair("RS256");
        const wrongSignature = await new SignJWT(valid).setProtectedHeader({ alg: "RS256", kid: "fixture" }).sign(otherKeys.privateKey);
        const headers = [undefined, "Basic secret", "Bearer malformed-secret", `Bearer ${wrongSignature}`, ...await Promise.all(invalidClaims.map(async claims => `Bearer ${await sign(claims)}`))];
        for (const authorization of headers) {
            const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json", ...(authorization ? { authorization } : {}) }, body: "{}" });
            assert.equal(response.status, 401);
            assert.match(response.headers.get("www-authenticate") ?? "", /resource_metadata="https:\/\/api.example\/\.well-known\/oauth-protected-resource"/);
            assert.deepEqual(await response.json(), { error: "invalid_token" });
        }
        assert.equal(resolutions, 0);
        assert.equal(executions, 0);
        const token = await sign(valid);
        await client.connect(new StreamableHTTPClientTransport(url, { requestInit: { headers: { authorization: `Bearer ${token}` } } }));
        const result = await client.callTool({ name: "probe", arguments: { userId: "model-supplied-owner" } });
        assert.deepEqual(result.content, [{ type: "text", text: JSON.stringify({ userId: "resolved-owner", scopes: ["workout:read"] }) }]);
        assert.equal(executions, 1);
        assert.throws(authenticatedRequest, /unavailable/);
    } finally {
        await client.close();
        await application.close();
        listener.closeAllConnections();
        await new Promise<void>((resolve, reject) => listener.close(error => error ? reject(error) : resolve()));
    }
    assert.doesNotMatch(logs, /private-subject-sentinel|malformed-secret|model-supplied-owner|Bearer|resolved-owner/);
});

test("provider and identity-store outages return safe server errors before tool execution", async () => {
    for (const failedDependency of ["verifier", "identity store"]) {
        let logs = "";
        let resolutions = 0;
        let executions = 0;
        const stream = new Writable({ write(chunk, _encoding, callback) { logs += chunk; callback(); } });
        const application = createApplication({ logger: createLogger("info", stream), authentication: {
            configuration: { issuer: "https://issuer.example/", resource: "https://api.example" },
            async verify() {
                if (failedDependency === "verifier") throw new Error("provider-secret-sentinel");
                return { issuer: "https://issuer.example/", subject: "subject-secret-sentinel", scopes: [] };
            },
            async resolveUser() { resolutions++; throw new Error("database-secret-sentinel"); },
            close: async () => {},
        }, serverFactory: () => { executions++; throw new Error("must not execute"); } });
        const listener = createServer(application.app);
        await new Promise<void>(resolve => listener.listen(0, "127.0.0.1", resolve));
        const address = listener.address();
        assert.ok(address && typeof address !== "string");
        try {
            const response = await fetch(`http://127.0.0.1:${address.port}/mcp`, {
                method: "POST", headers: { authorization: "Bearer token-secret-sentinel", "content-type": "application/json" }, body: "{}",
            });
            assert.equal(response.status, 500);
            assert.equal(response.headers.get("www-authenticate"), null);
            const body = await response.text();
            assert.match(body, /Internal server error/);
            assert.doesNotMatch(body, /secret-sentinel|Error:|stack/);
            assert.equal(resolutions, failedDependency === "verifier" ? 0 : 1);
            assert.equal(executions, 0);
        } finally {
            await application.close();
            listener.closeAllConnections();
            await new Promise<void>((resolve, reject) => listener.close(error => error ? reject(error) : resolve()));
        }
        assert.doesNotMatch(logs, /secret-sentinel|Bearer/);
        assert.match(logs, /application_failed/);
    }
});
