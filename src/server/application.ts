import { createMcpExpressApp } from "@modelcontextprotocol/express";
import { toNodeHandler } from "@modelcontextprotocol/node";
import { createMcpHandler } from "@modelcontextprotocol/server";
import type { ErrorRequestHandler } from "express";
import { createServer } from "./create-server.js";

/** Construct an unbound app; each MCP request receives its own server instance. */
export function createApplication() {
    const handler = createMcpHandler(() => createServer());
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
