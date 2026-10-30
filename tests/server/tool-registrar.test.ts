import assert from "node:assert/strict";
import { test } from "node:test";
import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport, McpServer, ProtocolError } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { ErrorDefinitions } from "../../src/diagnostics/error-definitions.js";
import { ApplicationError } from "../../src/diagnostics/errors.js";
import { ToolRegistrar } from "../../src/server/tools/tool-registrar.js";

test("registration guards sync and async handlers and retains SDK schema/context contracts", async () => {
    const server = new McpServer({ name: "registrar-test", version: "1" });
    const tools = new ToolRegistrar(server);
    let calls = 0;
    tools.registerTool("typed", {
        inputSchema: z.object({ count: z.number() }).strict(),
        outputSchema: z.object({ doubled: z.number() }),
    }, (args, context) => {
        calls++;
        assert.equal(context.mcpReq.method, "tools/call");
        const doubled = args.count * 2;
        return { content: [{ type: "text", text: String(doubled) }], structuredContent: { doubled } };
    });
    for (const definition of Object.values(ErrorDefinitions)) {
        tools.registerTool(definition.code, {}, () => {
            throw new ApplicationError(definition, "application");
        });
    }
    tools.registerTool("async", {}, async () => { throw new Error("private-cause"); });
    tools.registerTool("protocol", {}, () => { throw new ProtocolError(-32602, "SDK validation"); });
    tools.registerTool("context_only", {}, context => ({
        content: [{ type: "text", text: context.mcpReq.method }],
    }));
    tools.registerTool("invalid_output", {
        inputSchema: z.object({}),
        outputSchema: z.object({ count: z.number() }),
    }, () => ({ content: [], structuredContent: { count: "invalid" } }));
    tools.registerTool("sync_unexpected", {}, () => { throw new Error("private-sync-cause"); });
    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "registrar-client", version: "1" });
    try {
        await server.connect(serverTransport);
        await client.connect(clientTransport);
        assert.deepEqual((await client.callTool({ name: "typed", arguments: { count: 4 } })).structuredContent, { doubled: 8 });
        assert.equal((await client.callTool({ name: "typed", arguments: { count: "invalid" } })).isError, true);
        assert.equal(calls, 1);
        assert.deepEqual((await client.callTool({ name: "context_only", arguments: {} })).content,
            [{ type: "text", text: "tools/call" }]);
        assert.equal((await client.callTool({ name: "invalid_output", arguments: {} })).isError, true);
        const syncFailure = await client.callTool({ name: "sync_unexpected", arguments: {} });
        assert.equal(syncFailure.isError, true);
        assert.match(JSON.stringify(syncFailure), /INTERNAL_ERROR/);
        assert.doesNotMatch(JSON.stringify(syncFailure), /private-sync-cause/);
        for (const definition of Object.values(ErrorDefinitions)) {
            const result = await client.callTool({ name: definition.code, arguments: {} });
            assert.equal(result.isError, true);
            const text = result.content[0];
            assert.ok(text.type === "text");
            const error = JSON.parse(text.text);
            assert.deepEqual({ code: error.code, message: error.message, retryable: error.retryable }, {
                code: definition.code, message: definition.message, retryable: definition.retryable,
            });
        }
        const unexpected = await client.callTool({ name: "async", arguments: {} });
        assert.equal(unexpected.isError, true);
        assert.doesNotMatch(JSON.stringify(unexpected), /private-cause/);
        const protocol = await client.callTool({ name: "protocol", arguments: {} });
        assert.equal(protocol.isError, true);
        assert.match(JSON.stringify(protocol), /SDK validation/);
        assert.doesNotMatch(JSON.stringify(protocol), /INTERNAL_ERROR|requestId/);
    } finally {
        await client.close();
        await server.close();
    }
});

test("public error definitions expose the approved immutable codes and retry policy", () => {
    assert.deepEqual(ErrorDefinitions, {
        CONFIGURATION_INVALID: { code: "CONFIGURATION_INVALID", message: "Application configuration is invalid.", retryable: false, cause: "invalid_configuration" },
        DEPENDENCY_UNAVAILABLE: { code: "DEPENDENCY_UNAVAILABLE", message: "A required dependency is unavailable. Retry later.", retryable: true, cause: "dependency_unavailable" },
        INTERNAL_ERROR: { code: "INTERNAL_ERROR", message: "An internal error occurred.", retryable: false, cause: "unexpected_exception" },
    });
    assert.equal(Object.isFrozen(ErrorDefinitions), true);
    for (const definition of Object.values(ErrorDefinitions)) {
        assert.equal(Object.isFrozen(definition), true);
        const error = new ApplicationError(definition, "application");
        assert.equal(error.definition, definition);
    }
});

test("one registrar serves multiple registries with guarded plain handlers", async () => {
    const server = new McpServer({ name: "multiple-registries", version: "1" });
    const tools = new ToolRegistrar(server);
    const firstRegistry = (tools: ToolRegistrar) => {
        tools.registerTool("first_registry", {}, () => { throw new Error("private-first"); });
    };
    const secondRegistry = (tools: ToolRegistrar) => {
        tools.registerTool("second_registry", {}, async () => {
            throw new ApplicationError(ErrorDefinitions.DEPENDENCY_UNAVAILABLE, "database");
        });
    };
    firstRegistry(tools);
    secondRegistry(tools);
    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "registries-client", version: "1" });
    try {
        await server.connect(serverTransport);
        await client.connect(clientTransport);
        assert.deepEqual((await client.listTools()).tools.map(tool => tool.name), ["first_registry", "second_registry"]);
        const first = await client.callTool({ name: "first_registry", arguments: {} });
        const second = await client.callTool({ name: "second_registry", arguments: {} });
        assert.equal(first.isError, true);
        assert.equal(second.isError, true);
        assert.match(JSON.stringify(first), /INTERNAL_ERROR/);
        assert.match(JSON.stringify(second), /DEPENDENCY_UNAVAILABLE/);
        assert.doesNotMatch(JSON.stringify(first), /private-first/);
    } finally {
        await client.close();
        await server.close();
    }
});
