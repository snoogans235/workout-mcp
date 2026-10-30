import assert from "node:assert/strict";
import { test } from "node:test";
import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { createServer } from "../../src/server/create-server.js";

test("fresh servers register the exact status contract and close independently", async () => {
    const first = createServer();
    const second = createServer();
    assert.notEqual(first, second);
    const clients = [new Client({ name: "first", version: "1" }), new Client({ name: "second", version: "1" })];
    try {
        for (const [index, server] of [first, second].entries()) {
            const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
            await server.connect(serverTransport);
            await clients[index].connect(clientTransport);
            assert.deepEqual(clients[index].getServerVersion(), { name: "workout-mcp", version: "1.0.0" });
            assert.deepEqual((await clients[index].listTools()).tools, [{
                name: "server_status",
                title: undefined, icons: undefined, execution: undefined, _meta: undefined,
                description: "Return the local server's status, service name, and application version.",
                inputSchema: {
                    type: "object", properties: {}, additionalProperties: false,
                    $schema: "https://json-schema.org/draft/2020-12/schema",
                },
                outputSchema: {
                    type: "object",
                    properties: {
                        status: { type: "string", const: "ok" },
                        service: { type: "string", const: "workout-mcp" },
                        version: { type: "string" },
                    },
                    required: ["status", "service", "version"], additionalProperties: false,
                    $schema: "https://json-schema.org/draft/2020-12/schema",
                },
                annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
            }]);
        }
        await clients[0].close();
        await first.close();
        const status = { status: "ok", service: "workout-mcp", version: "1.0.0" };
        assert.deepEqual(await clients[1].callTool({ name: "server_status", arguments: {} }), {
            content: [{ type: "text", text: JSON.stringify(status) }], structuredContent: status,
        });
    } finally {
        await Promise.all(clients.map(client => client.close()));
        await Promise.all([first.close(), second.close()]);
    }
});
