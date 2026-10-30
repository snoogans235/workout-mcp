import { ErrorDefinitions } from "./error-definitions.js";
import { Writable } from "node:stream";
import { pino, type DestinationStream, type LevelWithSilent } from "pino";

const levels = ["fatal", "error", "warn", "info", "debug", "trace", "silent"] as const;
export function loggingLevel(value: string | undefined): LevelWithSilent {
    if (value === undefined) {
        return "info";
    }
    if (!levels.some(level => level === value)) {
        throw new Error("Invalid logging configuration.");
    }
    return value as LevelWithSilent;
}

// Values are closed vocabularies. Arbitrary objects, messages, causes and nested
// values never reach Pino, including fields supplied through untyped callers.
const vocabularies: Record<string, readonly string[]> = {
    event: ["startup", "shutdown", "request_completed", "request_failed", "application_failed", "startup_failed"],
    component: ["server", "configuration", "database", "application"],
    errorCode: Object.values(ErrorDefinitions).map(definition => definition.code),
    cause: Object.values(ErrorDefinitions).map(definition => definition.cause),
};
function safeFields(fields: Record<string, unknown> = {}): Record<string, unknown> {
    const safe: Record<string, unknown> = {};
    for (const [key, allowed] of Object.entries(vocabularies)) {
        if (typeof fields[key] === "string" && allowed.includes(fields[key])) {
            safe[key] = fields[key];
        }
    }
    if (typeof fields.requestId === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(fields.requestId)) {
        safe.requestId = fields.requestId;
    }
    if (Number.isInteger(fields.port) && Number(fields.port) >= 0 && Number(fields.port) <= 65535) {
        safe.port = fields.port;
    }
    if (typeof fields.retryable === "boolean") {
        safe.retryable = fields.retryable;
    }
    if (typeof fields.durationMs === "number" && Number.isFinite(fields.durationMs) && fields.durationMs >= 0) {
        safe.durationMs = fields.durationMs;
    }
    return safe;
}
export function createLogger(level: LevelWithSilent = "info", destination: DestinationStream = process.stdout) {
    loggingLevel(level);
    const logger = pino({
        level, base: undefined, timestamp: false,
        formatters: { bindings: safeFields, log: safeFields },
        redact: { paths: ["authorization", "cookie", "password", "token", "apiKey", "databaseUrl"], censor: "[REDACTED]" },
    }, destination);
    return {
        event(fields: Record<string, unknown>) { logger.info(safeFields(fields)); },
        failure(fields: Record<string, unknown>) { logger.error(safeFields(fields)); },
        request(requestId: string) {
            const child = logger.child(safeFields({ requestId }));
            return {
                event(fields: Record<string, unknown>) { child.info(safeFields(fields)); },
                failure(fields: Record<string, unknown>) { child.error(safeFields(fields)); },
            };
        },
        async flush(): Promise<void> {
            await new Promise<void>((resolve, reject) => logger.flush(error => error ? reject(error) : resolve()));
            // A caller-owned Writable may buffer beyond Pino's flush hook.
            if (destination instanceof Writable && destination.writableLength) {
                await new Promise<void>((resolve, reject) => destination.write("", error => error ? reject(error) : resolve()));
            }
        },
    };
}
export type DiagnosticLogger = ReturnType<typeof createLogger>;
