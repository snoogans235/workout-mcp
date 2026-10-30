import { createMcpExpressApp } from "@modelcontextprotocol/express";
import { toNodeHandler } from "@modelcontextprotocol/node";
import { createMcpHandler } from "@modelcontextprotocol/server";
import express, { type ErrorRequestHandler } from "express";
import { randomUUID } from "node:crypto";
import { createLogger, type DiagnosticLogger } from "../diagnostics/logger.js";
import { requestContext } from "../diagnostics/errors.js";
import { createServer } from "./create-server.js";

/** Construct an unbound app; each MCP request receives its own server instance. */
export function createApplication(options: { logger?: DiagnosticLogger; serverFactory?: typeof createServer } = {}) {
    const logger = options.logger ?? createLogger();
    const handler = createMcpHandler(() => (options.serverFactory ?? createServer)());
    const app = express();
    app.use("/mcp", (_request, response, next) => {
        const requestId = randomUUID();
        const child = logger.request(requestId);
        const started = performance.now();
        response.setHeader("X-Request-Id", requestId);
        let completed = false;
        const complete = () => {
            if (completed) { return; }
            completed = true;
            child.event({ event: response.writableFinished && response.statusCode < 400 ? "request_completed" : "request_failed", component: "server", durationMs: performance.now() - started });
        };
        response.once("finish", complete);
        response.once("close", complete);
        requestContext.run({ requestId, logger: child }, next);
    });
    app.use(createMcpExpressApp({ host: "127.0.0.1" }));
    app.disable("x-powered-by");
    const nodeHandler = toNodeHandler(handler);
    app.all("/mcp", async (request, response) => { await nodeHandler(request, response, request.body); });
    const errors: ErrorRequestHandler = (error: unknown, _request, response, _next) => {
        if (response.headersSent) { response.destroy(); return; }
        const malformed = error instanceof SyntaxError && "status" in error && error.status === 400;
        const status = error && typeof error === "object" && "status" in error && typeof error.status === "number"
            && error.status >= 400 && error.status < 500 ? error.status : 500;
        if (status >= 500) {
            requestContext.getStore()?.logger.failure({ event: "application_failed", component: "server", errorCode: "INTERNAL_ERROR", cause: "unexpected_exception" });
        }
        response.status(status).json({ jsonrpc: "2.0", id: null,
            error: { code: malformed ? -32700 : status < 500 ? -32600 : -32603,
                message: malformed ? "Parse error" : status < 500 ? "Invalid request" : "Internal server error",
                ...(status >= 500 ? { data: { code: "INTERNAL_ERROR", requestId: requestContext.getStore()?.requestId } } : {}) } });
    };
    app.use(errors);
    return { app, close: async () => { await handler.close(); await logger.flush(); } };
}
