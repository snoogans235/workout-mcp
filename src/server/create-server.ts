import { readFileSync } from "node:fs";
import { McpServer } from "@modelcontextprotocol/server";
import { registerTools } from "./tools/register-tools.js";

const metadata: unknown = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
if (!metadata || typeof metadata !== "object" || !("version" in metadata) || typeof metadata.version !== "string") {
    throw new Error("Application version metadata is invalid.");
}
const version = metadata.version;

/** Construct a fresh server with the application's explicitly registered tools. */
export function createServer() {
    const server = new McpServer({ name: "workout-mcp", version });
    registerTools(server, version);
    return server;
}
