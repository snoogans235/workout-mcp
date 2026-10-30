import type { ToolRegistrar } from "./tool-registrar.js";
import { registerServerStatus } from "./system/server-status.js";

export function registerTools(tools: ToolRegistrar, version: string): void {
    registerServerStatus(tools, version);
}
