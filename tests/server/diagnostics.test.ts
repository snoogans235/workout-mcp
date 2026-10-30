import assert from "node:assert/strict";
import { createServer as httpServer } from "node:http";
import { Writable } from "node:stream";
import { test } from "node:test";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { createApplication } from "../../src/server/application.js";
import { ErrorDefinitions } from "../../src/diagnostics/error-definitions.js";
import { ToolRegistrar } from "../../src/server/tools/tool-registrar.js";
import { ApplicationError, toolBoundary } from "../../src/diagnostics/errors.js";
import { createLogger, loggingLevel } from "../../src/diagnostics/logger.js";

const secret = "private-workout-password-sentinel";
function capture() {
    let text = "";
    const stream = new Writable({ write(chunk, _encoding, callback) { text += chunk.toString(); callback(); } });
    return { logger: createLogger("info", stream), text: () => text };
}

test("logger drops arbitrary and nested secrets and rejects invalid configuration", async () => {
    const output = capture();
    output.logger.failure({ event: "application_failed", component: secret, password: secret,
        errorCode: "INTERNAL_ERROR", cause: secret, nested: { authorization: secret }, error: new Error(secret) });
    await output.logger.flush();
    assert.doesNotMatch(output.text(), new RegExp(secret));
    assert.deepEqual(JSON.parse(output.text()), { level: 50, event: "application_failed", errorCode: "INTERNAL_ERROR" });
    assert.throws(() => loggingLevel(secret), /Invalid logging configuration/);
    assert.equal(loggingLevel(undefined), "info");
});

for (const [level, expectedLevels] of [[undefined, [30, 50]], ["error", [50]], ["silent", []]] as const) {
    test(`logging threshold ${level ?? "default"} emits only the configured severities and flushes`, async () => {
        let text = "";
        const destination = new Writable({ write(chunk, _encoding, callback) {
            text += chunk.toString();
            callback();
        } });
        const logger = createLogger(level, destination);
        logger.event({ event: "startup", component: "server", port: 3000 });
        logger.failure({ event: "startup_failed", component: "configuration", errorCode: "CONFIGURATION_INVALID", cause: "invalid_configuration" });
        await logger.flush();
        const entries = text.trim() ? text.trim().split("\n").map(line => JSON.parse(line)) : [];
        assert.deepEqual(entries.map(entry => entry.level), expectedLevels);
        if (level !== "silent") {
            assert.deepEqual(entries.at(-1), { level: 50, event: "startup_failed", component: "configuration", errorCode: "CONFIGURATION_INVALID", cause: "invalid_configuration" });
        }
        assert.equal(destination.writableLength, 0);
    });
}

for (const dependency of [false, true]) {
    test(`logs one correlated error with safe cause and retry guidance for ${dependency ? "dependency unavailability" : "an unexpected exception"}`, async () => {
        const output = capture();
        const application = createApplication({ logger: output.logger, serverFactory: () => {
            const server = new McpServer({ name: "test", version: "1" });
            new ToolRegistrar(server).registerTool("test_failure", { inputSchema: z.object({ value: z.string() }) }, async () => {
                if (dependency) {
                    throw new ApplicationError(ErrorDefinitions.DEPENDENCY_UNAVAILABLE, "database", { cause: new Error(`postgresql://${secret}@localhost/private`) });
                }
                throw new Error(secret);
            });
            return server;
        } });
        const listener = httpServer(application.app);
        await new Promise<void>(resolve => listener.listen(0, "127.0.0.1", resolve));
        const address = listener.address();
        assert.ok(address && typeof address !== "string");
        const client = new Client({ name: "test", version: "1" }, { versionNegotiation: { mode: { pin: "2026-07-28" } } });
        let header: string | null = null;
        const ids = new Set<string>();
        try {
            await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${address.port}/mcp`), { fetch: async (url, init) => {
                const headers = new Headers(init?.headers);
                headers.set("authorization", `Bearer ${secret}`);
                headers.set("cookie", secret);
                headers.set("X-Request-Id", secret);
                const response = await fetch(url, { ...init, headers });
                header = response.headers.get("X-Request-Id");
                assert.match(header ?? "", /^[0-9a-f-]{36}$/);
                assert.ok(!ids.has(header!));
                ids.add(header!);
                return response;
            } }));
            const result = await client.callTool({ name: "test_failure", arguments: { value: secret } });
            assert.equal(result.isError, true);
            const content = result.content as Array<{ type: string; text: string }>;
            const error = JSON.parse(content[0].text);
            assert.equal(error.code, dependency ? "DEPENDENCY_UNAVAILABLE" : "INTERNAL_ERROR");
            assert.equal(error.retryable, dependency);
            assert.equal(error.requestId, header);
            const failures = output.text().trim().split("\n").map(line => JSON.parse(line)).filter(entry => entry.event === "application_failed");
            assert.deepEqual(failures, [{
                level: 50,
                requestId: header,
                event: "application_failed",
                component: dependency ? "database" : "application",
                errorCode: dependency ? "DEPENDENCY_UNAVAILABLE" : "INTERNAL_ERROR",
                retryable: dependency,
                cause: dependency ? "dependency_unavailable" : "unexpected_exception",
            }]);
            assert.doesNotMatch(JSON.stringify(result) + output.text(), new RegExp(`${secret}|postgresql:|stack|arguments`));
            await assert.rejects(() => client.callTool({ name: "missing", arguments: {} }));
        } finally {
            await client.close();
            await application.close();
            listener.closeAllConnections();
            await new Promise<void>((resolve, reject) => listener.close(error => error ? reject(error) : resolve()));
        }
    });
}

test("SDK protocol errors pass through the application boundary unchanged", async () => {
    const { ProtocolError } = await import("@modelcontextprotocol/server");
    const error = new ProtocolError(-32601, "Method not found");
    await assert.rejects(() => toolBoundary(async () => { throw error; }), candidate => candidate === error);
});

test("concurrent request failures retain their own correlation across asynchronous work", async () => {
    const output = capture();
    const application = createApplication({ logger: output.logger, serverFactory: () => {
        const server = new McpServer({ name: "concurrency-test", version: "1" });
        new ToolRegistrar(server).registerTool("test_failure", { inputSchema: z.object({}) }, async () => {
            await new Promise<void>(resolve => setImmediate(resolve));
            throw new ApplicationError(ErrorDefinitions.CONFIGURATION_INVALID, "configuration", { cause: new Error(secret) });
        });
        return server;
    } });
    const listener = httpServer(application.app);
    await new Promise<void>(resolve => listener.listen(0, "127.0.0.1", resolve));
    const address = listener.address();
    assert.ok(address && typeof address !== "string");
    const ids: string[] = [];
    try {
        await Promise.all(Array.from({ length: 6 }, async () => {
            const client = new Client({ name: "concurrent", version: "1" }, { versionNegotiation: { mode: { pin: "2026-07-28" } } });
            let header: string | null = null;
            try {
                await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${address.port}/mcp`), { fetch: async (url, init) => {
                    const response = await fetch(url, init);
                    header = response.headers.get("X-Request-Id");
                    return response;
                } }));
                const result = await client.callTool({ name: "test_failure", arguments: {} });
                assert.equal(result.isError, true);
                assert.ok(Array.isArray(result.content));
                const content = result.content[0];
                assert.equal(content.type, "text");
                assert.ok("text" in content && typeof content.text === "string");
                const error = JSON.parse(content.text);
                assert.equal(typeof error.requestId, "string");
                ids.push(error.requestId);
                assert.deepEqual(error, { code: "CONFIGURATION_INVALID", message: "Application configuration is invalid.", retryable: false, requestId: header });
            } finally {
                await client.close();
            }
        }));
        await output.logger.flush();
        const failures = output.text().trim().split("\n").map(line => JSON.parse(line)).filter(entry => entry.event === "application_failed");
        assert.equal(new Set(ids).size, 6);
        assert.deepEqual(failures.map(entry => entry.requestId).sort(), ids.sort());
        assert.ok(failures.every(entry => entry.level === 50 && entry.cause === "invalid_configuration"
            && entry.component === "configuration" && entry.errorCode === "CONFIGURATION_INVALID" && entry.retryable === false));
        assert.doesNotMatch(output.text(), new RegExp(secret));
    } finally {
        await application.close();
        listener.closeAllConnections();
        await new Promise<void>((resolve, reject) => listener.close(error => error ? reject(error) : resolve()));
    }
});

test("logs startup port and one shutdown event and flushes a delayed destination", async () => {
    const { startServer } = await import("../../src/server/listener.js");
    let text = "";
    const destination = new Writable({ write(chunk, _encoding, callback) {
        setImmediate(() => { text += chunk.toString(); callback(); });
    } });
    const logger = createLogger("info", destination);
    const server = await startServer({ host: "127.0.0.1", port: 0 }, { logger });
    await server.close();
    assert.deepEqual(text.trim().split("\n").map(line => JSON.parse(line)), [
        { level: 30, event: "startup", component: "server", port: Number(server.url.port) },
        { level: 30, event: "shutdown", component: "server" },
    ]);
    assert.equal(destination.writableLength, 0);
    assert.equal(destination.destroyed, false);
});

test("logs exactly one completion per successful or malformed request with its header ID and duration", async () => {
    const { startServer } = await import("../../src/server/listener.js");
    const output = capture();
    const server = await startServer({ host: "127.0.0.1", port: 0 }, { logger: output.logger });
    const client = new Client({ name: secret, version: "1" }, { versionNegotiation: { mode: { pin: "2026-07-28" } } });
    const expectedCompletions: Array<{ requestId: string; event: string }> = [];
    const recordResponse = (response: Response) => {
        const requestId = response.headers.get("X-Request-Id");
        assert.match(requestId ?? "", /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
        assert.ok(requestId);
        expectedCompletions.push({ requestId, event: response.status < 400 ? "request_completed" : "request_failed" });
    };
    try {
        await client.connect(new StreamableHTTPClientTransport(server.url, { fetch: async (url, init) => {
            const response = await fetch(url, init);
            recordResponse(response);
            return response;
        } }));
        assert.deepEqual((await client.listTools()).tools.map(tool => tool.name), ["server_status"]);
        const result = await client.callTool({ name: "server_status", arguments: {} });
        assert.equal(result.isError, undefined);
        const response = await fetch(server.url, { method: "POST", headers: { "content-type": "application/json", authorization: secret }, body: `{\"workout\":\"${secret}\",` });
        recordResponse(response);
        assert.equal(response.status, 400);
        assert.deepEqual(await response.json(), { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
        assert.match(response.headers.get("X-Request-Id") ?? "", /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    } finally {
        await client.close();
        await server.close();
    }
    const entries = output.text().trim().split("\n").map(line => JSON.parse(line));
    const allowed = new Set(["level", "event", "component", "port", "requestId", "durationMs"]);
    assert.ok(entries.every(entry => Object.keys(entry).every(key => allowed.has(key))));
    assert.ok(entries.some(entry => entry.event === "request_completed"));
    assert.ok(entries.some(entry => entry.event === "request_failed"));
    const completions = entries.filter(entry => entry.event === "request_completed" || entry.event === "request_failed");
    assert.equal(completions.length, expectedCompletions.length);
    assert.equal(new Set(completions.map(entry => entry.requestId)).size, expectedCompletions.length);
    for (const expected of expectedCompletions) {
        const matching = completions.filter(entry => entry.requestId === expected.requestId);
        assert.equal(matching.length, 1);
        assert.equal(matching[0].event, expected.event);
        assert.equal(matching[0].level, 30);
        assert.equal(matching[0].component, "server");
        assert.equal(typeof matching[0].durationMs, "number");
        assert.ok(Number.isFinite(matching[0].durationMs) && matching[0].durationMs >= 0);
    }
    assert.ok(!entries.some(entry => entry.event === "application_failed"));
    assert.doesNotMatch(output.text(), new RegExp(`${secret}|server_status|structuredContent|workout|authorization`));
});
