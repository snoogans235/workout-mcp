import { readFileSync } from "node:fs";
import { createMcpExpressApp } from "@modelcontextprotocol/express";
import { toNodeHandler } from "@modelcontextprotocol/node";
import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import type { ErrorRequestHandler } from "express";
import * as z from "zod/v4";

const metadata: unknown = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
if (!metadata || typeof metadata !== "object" || !("version" in metadata) || typeof metadata.version !== "string") {
    throw new Error("Application version metadata is invalid.");
}
const version = metadata.version;
const service = "workout-mcp";

/** Construct an unbound app; each MCP request receives its own server instance. */
export function createApplication() {
    const handler = createMcpHandler(() => {
        const server = new McpServer({ name: service, version });
        server.registerTool("server_status", {
            description: "Return the local server's status, service name, and application version.",
            inputSchema: z.object({}).strict(),
            outputSchema: z.object({ status: z.literal("ok"), service: z.literal(service), version: z.string() }).strict(),
            annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
        }, async () => {
            const status = { status: "ok" as const, service, version };
            return { content: [{ type: "text", text: JSON.stringify(status) }], structuredContent: status };
        });
        return server;
    });
    const app = createMcpExpressApp({ host: "127.0.0.1" });
    app.disable("x-powered-by");
    const nodeHandler = toNodeHandler(handler);
    app.all("/mcp", async (request, response) => { await nodeHandler(request, response, request.body); });
    const errors: ErrorRequestHandler = (error: unknown, _request, response, _next) => {
        if (response.headersSent) { response.destroy(); return; }
        const malformed = error instanceof SyntaxError && "status" in error && error.status === 400;
        const status = error && typeof error === "object" && "status" in error && typeof error.status === "number"
            && error.status >= 400 && error.status < 500 ? error.status : 500;
        response.status(status).json({ jsonrpc: "2.0", id: null,
            error: { code: malformed ? -32700 : status < 500 ? -32600 : -32603,
                message: malformed ? "Parse error" : status < 500 ? "Invalid request" : "Internal server error" } });
    };
    app.use(errors);
    return { app, close: () => handler.close() };
}
