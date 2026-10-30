import { loadProjectEnv } from "./environment.js";
import { serverConfiguration } from "./server/config.js";
import { startServer } from "./server/listener.js";

try {
    loadProjectEnv();
    const server = await startServer(serverConfiguration(process.env));
    const stop = () => {
        void server.close().catch(() => {
            console.error("Local MCP shutdown failed."); process.exitCode = 1;
        }).finally(() => {
            process.off("SIGINT", stop); process.off("SIGTERM", stop);
        });
    };
    process.once("SIGINT", stop); process.once("SIGTERM", stop);
    console.log(`Local MCP listening at ${server.url.href}`);
} catch {
    console.error("Local MCP startup failed. Set MCP_HOST to 127.0.0.1 and MCP_PORT to an available integer port (0 selects an ephemeral port).");
    process.exitCode = 1;
}
