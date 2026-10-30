import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

const service = "workout-mcp";

export function registerServerStatus(server: McpServer, version: string): void {
    server.registerTool("server_status", {
        description: "Return the local server's status, service name, and application version.",
        inputSchema: z.object({}).strict(),
        outputSchema: z.object({
            status: z.literal("ok"),
            service: z.literal(service),
            version: z.string(),
        }).strict(),
        annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: false,
        },
    }, async () => {
        const status = { status: "ok" as const, service, version };
        return {
            content: [{ type: "text", text: JSON.stringify(status) }],
            structuredContent: status,
        };
    });
}
