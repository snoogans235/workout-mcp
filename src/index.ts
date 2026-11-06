import { createLogger, loggingLevel } from "./diagnostics/logger.js";
import { loadProjectEnv } from "./environment.js";
import { serverConfiguration } from "./server/config.js";
import { startServer } from "./server/listener.js";

try {
    loadProjectEnv();
    const logger = createLogger(loggingLevel(process.env.LOG_LEVEL));
    const starting = startServer(serverConfiguration(process.env), { logger });
    let stopping: Promise<void> | undefined;
    const stop = () => {
        stopping ??= starting.then(server => server.close()).catch(async () => {
            logger.failure({ event: "application_failed", component: "server", errorCode: "INTERNAL_ERROR", cause: "unexpected_exception" });
            await logger.flush();
            process.exitCode = 1;
        }).finally(() => {
            process.off("SIGINT", stop); process.off("SIGTERM", stop);
        });
    };
    // startServer announces readiness before its promise resumes here. Install
    // handlers while startup is pending and keep them through graceful shutdown.
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
    try {
        await starting;
    } catch (error) {
        process.off("SIGINT", stop);
        process.off("SIGTERM", stop);
        throw error;
    }

} catch {
    const logger = createLogger("info", process.stderr);
    logger.failure({ event: "startup_failed", component: "configuration", errorCode: "CONFIGURATION_INVALID", cause: "invalid_configuration" });
    await logger.flush();
    process.exitCode = 1;
}
