export interface ServerConfiguration { host: "127.0.0.1"; port: number }

export function serverConfiguration(env: NodeJS.ProcessEnv): ServerConfiguration {
    const host = env.MCP_HOST ?? "127.0.0.1";
    const port = env.MCP_PORT;
    if (host !== "127.0.0.1" || port === undefined || !/^(0|[1-9]\d{0,4})$/.test(port) || Number(port) > 65535) {
        throw new Error("Set MCP_HOST to 127.0.0.1 and MCP_PORT to an integer from 0 to 65535.");
    }
    return { host, port: Number(port) };
}
