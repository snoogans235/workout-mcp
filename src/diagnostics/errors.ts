import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { ProtocolError, type CallToolResult } from "@modelcontextprotocol/server";
import { ErrorDefinitions, type ErrorDefinition } from "./error-definitions.js";
import type { DiagnosticLogger } from "./logger.js";

export class ApplicationError extends Error {
    constructor(public readonly definition: ErrorDefinition, public readonly component: "database" | "application" | "configuration", options?: ErrorOptions) {
        super(definition.code, options);
    }
}
export const requestContext = new AsyncLocalStorage<{
    requestId: string;
    logger: ReturnType<DiagnosticLogger["request"]>;
}>();

export async function toolBoundary<T>(operation: () => T | Promise<T>): Promise<T | CallToolResult> {
    try {
        return await operation();
    } catch (error) {
        if (error instanceof ProtocolError) {
            throw error;
        }
        const definition = error instanceof ApplicationError ? error.definition : ErrorDefinitions.INTERNAL_ERROR;
        const { code, message, retryable, cause } = definition;
        const requestId = requestContext.getStore()?.requestId ?? randomUUID();
        requestContext.getStore()?.logger.failure({
            event: "application_failed", component: error instanceof ApplicationError ? error.component : "application",
            errorCode: code, retryable, cause,
        });
        return { isError: true, content: [{ type: "text", text: JSON.stringify({ code, message, retryable, requestId }) }] };
    }
}
