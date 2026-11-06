import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { InMemoryTransport, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { createLogger } from "../../src/diagnostics/logger.js";
import { authenticatedRequest, authenticatedRequests } from "../../src/authentication/requests.js";
import { createApplication } from "../../src/server/application.js";
import { ToolRegistrar } from "../../src/server/tools/tool-registrar.js";

test("HTTP read/write matrix denies before handlers and challenges exact required scopes", async () => {
    const grants: Record<string, string[]> = {
        both: ["workout:read", "workout:write"],
        read: ["workout:read"],
        write: ["workout:write"],
        empty: [],
        unknown: ["unrelated", "workout:READ"],
    };
    let reads = 0;
    let writes = 0;
    const application = createApplication({
        logger: createLogger("silent"),
        authentication: {
            configuration: { issuer: "https://issuer.example/", resource: "https://api.example" },
            verify: async token => ({ issuer: "https://issuer.example/", subject: "fixture", scopes: grants[token] ?? [] }),
            resolveUser: async () => ({ id: "verified-owner" }),
            close: async () => {},
        },
        serverFactory: () => {
            const server = new McpServer({ name: "scope-fixture", version: "1" });
            const tools = new ToolRegistrar(server);
            for (const operation of ["read", "write"] as const) {
                tools.registerTool(operation, {
                    requiredScope: operation === "read" ? "workout:read" : "workout:write",
                    inputSchema: z.object({ userId: z.string() }),
                }, () => {
                    assert.equal(authenticatedRequest().userId, "verified-owner");
                    if (operation === "read") {
                        reads++;
                    } else {
                        writes++;
                    }
                    return { content: [{ type: "text", text: "ok" }] };
                });
            }
            return server;
        },
    });
    const listener = createServer(application.app);
    await new Promise<void>(resolve => listener.listen(0, "127.0.0.1", resolve));
    const address = listener.address();
    assert.ok(address && typeof address !== "string");
    const url = new URL(`http://127.0.0.1:${address.port}/mcp`);
    try {
        for (const token of ["read", "write", "both", "unknown", "empty"]) {
            const responses: { status: number; challenge: string | null; body: string }[] = [];
            const client = new Client({ name: "scope-verifier", version: "1" }, { versionNegotiation: { mode: { pin: "2026-07-28" } } });
            try {
                await client.connect(new StreamableHTTPClientTransport(url, { fetch: async (input, init) => {
                    const headers = new Headers(init?.headers);
                    headers.set("authorization", `Bearer ${token}`);
                    const response = await fetch(input, { ...init, headers });
                    if (response.status === 403) {
                        responses.push({ status: response.status, challenge: response.headers.get("www-authenticate"), body: await response.clone().text() });
                    }
                    return response;
                } }));
                for (const operation of ["read", "write"] as const) {
                    const allowed = token === operation || token === "both";
                    const before = { reads, writes };
                    const call = () => client.callTool({ name: operation, arguments: { userId: "forged-owner" } });
                    if (allowed) {
                        const result = await call();
                        assert.notEqual(result.isError, true);
                    } else {
                        await assert.rejects(call);
                        assert.deepEqual({ reads, writes }, before);
                        const response = responses.at(-1)!;
                        assert.equal(response.status, 403);
                        assert.equal(response.challenge, `Bearer error="insufficient_scope", scope="workout:${operation}", resource_metadata="https://api.example/.well-known/oauth-protected-resource"`);
                        assert.deepEqual(JSON.parse(response.body), { error: "insufficient_scope", scope: `workout:${operation}` });
                    }
                }
            } finally { await client.close(); }
        }
        assert.equal(reads, 2);
        assert.equal(writes, 2);
    } finally {
        await application.close();
        await new Promise<void>((resolve, reject) => listener.close(error => error ? reject(error) : resolve()));
    }
});

test("concurrent requests retain their own scopes and denied or malformed requests close their server", async () => {
    const closed: boolean[] = [];
    const owners: string[] = [];
    const application = createApplication({
        logger: createLogger("silent"),
        authentication: {
            configuration: { issuer: "https://issuer.example/", resource: "https://api.example" },
            verify: async token => ({ issuer: "https://issuer.example/", subject: token, scopes: token === "allowed" ? ["workout:write"] : [] }),
            resolveUser: async identity => ({ id: identity.subject }),
            close: async () => {},
        },
        serverFactory: () => {
            const index = closed.push(false) - 1;
            const server = new McpServer({ name: "concurrent-scopes", version: "1" });
            const close = server.close.bind(server);
            server.close = async () => { closed[index] = true; await close(); };
            new ToolRegistrar(server).registerTool("write", { requiredScope: "workout:write" }, async () => {
                await Promise.resolve();
                owners.push(authenticatedRequest().userId);
                return { content: [{ type: "text", text: "ok" }] };
            });
            return server;
        },
    });
    const listener = createServer(application.app);
    await new Promise<void>(resolve => listener.listen(0, "127.0.0.1", resolve));
    const address = listener.address();
    assert.ok(address && typeof address !== "string");
    const url = `http://127.0.0.1:${address.port}/mcp`;
    const call = (token: string, body: unknown) => fetch(url, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2026-07-28", "mcp-method": "tools/call", "mcp-name": "write" },
        body: JSON.stringify(body),
    });
    const write = { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "write", arguments: {}, _meta: { "io.modelcontextprotocol/protocolVersion": "2026-07-28", "io.modelcontextprotocol/clientCapabilities": {} } } };
    try {
        const responses = await Promise.all([call("allowed", write), call("denied", write), call("allowed", {})]);
        assert.deepEqual(responses.map(response => response.status), [200, 403, 400], await responses[0].clone().text());
        await Promise.all(responses.map(response => response.text()));
        assert.deepEqual(owners, ["allowed"]);
        assert.equal(closed.length, 3);
        assert.ok(closed.every(Boolean));
        const batch = await call("denied", [write, { ...write, id: 2 }]);
        assert.equal(batch.status, 403);
        await batch.text();
        assert.deepEqual(owners, ["allowed"]);
        assert.ok(closed.every(Boolean));
    } finally {
        await application.close();
        await new Promise<void>((resolve, reject) => listener.close(error => error ? reject(error) : resolve()));
    }
});


test("registrar rejects calls without read scope even when HTTP dispatch is bypassed", async () => {
    const server = new McpServer({ name: "registrar-denial", version: "1" });
    let executions = 0;
    new ToolRegistrar(server).registerTool("private", { requiredScope: "workout:read" }, () => {
        executions++;
        return { content: [{ type: "text", text: "private-data-sentinel" }] };
    });
    const client = new Client({ name: "registrar-denial-client", version: "1" });
    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    try {
        await authenticatedRequests.run({ userId: "verified-owner", scopes: ["unrelated"] }, async () => {
            await server.connect(serverTransport);
            await client.connect(clientTransport);
            const result = await client.callTool({ name: "private", arguments: {} });
            assert.equal(result.isError, true);
            assert.equal(executions, 0);
            assert.doesNotMatch(JSON.stringify(result), /private-data-sentinel|verified-owner|unrelated/);
        });
    } finally {
        await client.close();
        await server.close();
    }
});
