import type { McpServer } from "@modelcontextprotocol/server";
import { registerServerStatus } from "./system/server-status.js";

export function registerTools(server: McpServer, version: string): void {
    registerServerStatus(server, version);
}
