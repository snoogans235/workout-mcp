import { createLogger, loggingLevel, type DiagnosticLogger } from "../diagnostics/logger.js";
import { createServer } from "node:http";
import { createApplication } from "./application.js";
import { serverConfiguration, type ServerConfiguration } from "./config.js";

export async function startServer(configuration: ServerConfiguration, options: { logger?: DiagnosticLogger; logLevel?: string } = {}) {
    // Validate callers too, rather than trusting only the process entry point.
    const { host, port } = serverConfiguration({ MCP_HOST: configuration.host, MCP_PORT: String(configuration.port) });
    const level = loggingLevel(options.logLevel ?? process.env.LOG_LEVEL);
    const logger = options.logger ?? createLogger(level);
    const application = createApplication({ logger });
    const listener = createServer(application.app);
    try {
        await new Promise<void>((resolve, reject) => {
            const failed = (error: Error) => { reject(error); };
            listener.once("error", failed);
            listener.listen(port, host, () => { listener.off("error", failed); resolve(); });
        });
    } catch (error) { await application.close(); throw error; }
    const address = listener.address();
    if (!address || typeof address === "string") throw new Error("Local listener did not receive a TCP address.");
    logger.event({ event: "startup", component: "server", port: address.port });
    let closing: Promise<void> | undefined;
    return {
        url: new URL(`http://${host}:${address.port}/mcp`),
        close(): Promise<void> {
            return closing ??= (async () => {
                const closed = new Promise<void>((resolve, reject) => listener.close(error => error ? reject(error) : resolve()));
                try { await application.close(); }
                finally {
                    listener.closeAllConnections();
                    await closed;
                    logger.event({ event: "shutdown", component: "server" });
                    await logger.flush();
                }
            })();
        },
    };
}
