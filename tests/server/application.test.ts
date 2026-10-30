import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { request } from "node:http";
import { test } from "node:test";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { startServer } from "../../src/server/listener.js";

test("official client discovers and calls only the strict readonly status tool", async () => {
    const server = await startServer({ host: "127.0.0.1", port: 0 });
    const client = new Client({ name: "verification", version: "1.0.0" }, { versionNegotiation: { mode: { pin: "2026-07-28" } } });
    try {
        await client.connect(new StreamableHTTPClientTransport(server.url));
        const tools = await client.listTools();
        assert.deepEqual(tools.tools.map(tool => tool.name), ["server_status"]);
        assert.equal(tools.tools[0].annotations?.readOnlyHint, true);
        const result = await client.callTool({ name: "server_status", arguments: {} });
        assert.deepEqual(result.structuredContent, { status: "ok", service: "workout-mcp", version: "1.0.0" });
        assert.deepEqual(result.content, [{ type: "text", text: JSON.stringify(result.structuredContent) }]);
        assert.equal(client.getProtocolEra(), "modern");
        assert.equal(client.getNegotiatedProtocolVersion(), "2026-07-28");
        const invalid = await client.callTool({ name: "server_status", arguments: { extra: "argument-secret-sentinel" } });
        assert.equal(invalid.isError, true);
        assert.doesNotMatch(JSON.stringify(invalid), /argument-secret-sentinel|\/Users\/|node_modules|Error:/);
        await assert.rejects(() => client.callTool({ name: "unknown_tool", arguments: {} }));
    } finally { await client.close(); await server.close(); }
});

test("malformed requests, nonlocal headers, and unsupported methods fail without stack traces", async () => {
    const server = await startServer({ host: "127.0.0.1", port: 0 });
    const send = (body: string, headers: Record<string, string> = {}, method = "POST") => new Promise<{ status: number; body: string }>((resolve, reject) => {
        const call = request(server.url, { method, headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...headers } }, response => {
            let text = "";
            response.setEncoding("utf8").on("data", chunk => { text += chunk; });
            response.on("end", () => resolve({ status: response.statusCode ?? 0, body: text }));
        });
        call.on("error", reject); call.end(body);
    });
    try {
        for (const [response, status] of [
            [await send("{"), 400],
            [await send("{}"), 400],
            [await send("{}", { host: "remote.example" }), 403],
            [await send("{}", { origin: "https://remote.example" }), 403],
            [await send("{", { host: "remote.example" }), 403],
            [await send("{", { origin: "https://remote.example" }), 403],
            [await send("{}", { origin: "null" }), 403],
            [await send("{}", { host: "127.0.0.1.remote.example" }), 403],
            [await send("{}", { "content-type": "application/json;charset=unsupported" }), 415],
            [await send("{}", { "content-encoding": "unsupported" }), 415],
            [await send(JSON.stringify({ value: "x".repeat(120_000) })), 413],
            [await send("", {}, "PUT"), 405],
        ] as const) {
            assert.equal(response.status, status);
            assert.equal(JSON.parse(response.body).jsonrpc, "2.0");
            assert.doesNotMatch(response.body, /node_modules|\/Users\/|Error:|DATABASE_URL|password/);
        }
    } finally { await server.close(); }
});

test("modern stateless requests neither require nor return a reusable protocol session", async () => {
    const server = await startServer({ host: "127.0.0.1", port: 0 });
    try {
        for (const session of [undefined, "caller-supplied-session"]) {
            const client = new Client({ name: "stateless-verification", version: "1.0.0" },
                { versionNegotiation: { mode: { pin: "2026-07-28" } } });
            try {
                await client.connect(new StreamableHTTPClientTransport(server.url, { fetch: async (url, init) => {
                    const headers = new Headers(init?.headers);
                    if (session) headers.set("mcp-session-id", session);
                    const response = await fetch(url, { ...init, headers });
                    assert.equal(response.headers.get("mcp-session-id"), null);
                    return response;
                } }));
                assert.deepEqual((await client.listTools()).tools.map(tool => tool.name), ["server_status"]);
            } finally { await client.close(); }
        }
    } finally { await server.close(); }
});

test("composition imports open no listener or database connection", () => {
    const result = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", `
        import { Server, Socket } from "node:net";
        Server.prototype.listen = function () { throw new Error("Unexpected listener"); };
        Socket.prototype.connect = function () { throw new Error("Unexpected connection"); };
        const {createApplication} = await import("./src/server/application.ts");
        const app = createApplication(); await app.close();
    `], { encoding: "utf8", timeout: 5000 });
    assert.equal(result.status, 0, result.stderr);
});
