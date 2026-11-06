import { createMcpExpressApp } from "@modelcontextprotocol/express";
import { toNodeHandler } from "@modelcontextprotocol/node";
import { createMcpHandler } from "@modelcontextprotocol/server";
import express, { type ErrorRequestHandler } from "express";
import { AsyncLocalStorage } from "node:async_hooks";
import { requiredToolScope } from "./tools/tool-registrar.js";
import { authenticatedRequest } from "../authentication/requests.js";
import { randomUUID } from "node:crypto";
import { createLogger, type DiagnosticLogger } from "../diagnostics/logger.js";
import { requestContext } from "../diagnostics/errors.js";
import { createServer } from "./create-server.js";
import { requireAuthentication, resourceMetadata, type Authentication } from "../authentication/requests.js";

/** Construct an unbound app; each MCP request receives its own server instance. */
export function createApplication(options: { logger?: DiagnosticLogger; serverFactory?: typeof createServer; authentication?: Authentication } = {}) {
    const logger = options.logger ?? createLogger();
    const requestServers = new AsyncLocalStorage<ReturnType<typeof createServer>>();
    const handler = createMcpHandler(() => {
        const server = requestServers.getStore();
        if (!server) {
            throw new Error("Request server is unavailable.");
        }
        return server;
    });
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
    const authentication = options.authentication;
    if (authentication) {
        app.get("/.well-known/oauth-protected-resource", (_request, response) => {
            response.json(resourceMetadata(authentication.configuration));
        });
        app.use("/mcp", requireAuthentication(authentication));
    } else {
        app.use("/mcp", (_request, response) => { response.status(401).json({ error: "invalid_token" }); });
    }
    const nodeHandler = toNodeHandler(handler);
    app.all("/mcp", async (request, response) => {
        const server = (options.serverFactory ?? createServer)();
        try {
            const messages: unknown[] = Array.isArray(request.body) ? request.body : [request.body];
            for (const message of messages) {
                if (!message || typeof message !== "object" || !("method" in message)
                    || message.method !== "tools/call" || !("params" in message)) {
                    continue;
                }
                const params = message.params;
                if (!params || typeof params !== "object" || !("name" in params) || typeof params.name !== "string") {
                    continue;
                }
                const scope = requiredToolScope(server, params.name);
                if (authentication && scope && !authenticatedRequest().scopes.includes(scope)) {
                    const resource = authentication.configuration.resource;
                    const metadataUrl = new URL("/.well-known/oauth-protected-resource", resource).href;
                    response.setHeader("WWW-Authenticate", `Bearer error="insufficient_scope", scope="${scope}", resource_metadata="${metadataUrl}"`);
                    response.status(403).json({ error: "insufficient_scope", scope });
                    return;
                }
            }
            await requestServers.run(server, () => nodeHandler(request, response, request.body));
        } finally {
            await server.close();
        }
    });
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
