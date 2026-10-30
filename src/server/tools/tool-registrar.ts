import type { McpServer, StandardSchemaWithJSON, ToolCallback } from "@modelcontextprotocol/server";
import { toolBoundary } from "../../diagnostics/errors.js";

type ToolMetadata = Omit<Parameters<McpServer["registerTool"]>[1], "inputSchema" | "outputSchema">;

/** Tool modules receive this boundary rather than an unguarded SDK server. */
export class ToolRegistrar {
    constructor(private readonly server: McpServer) {}

    registerTool<Output extends StandardSchemaWithJSON, Input extends StandardSchemaWithJSON | undefined = undefined>(
        name: string,
        config: ToolMetadata & { inputSchema?: Input; outputSchema?: Output },
        handler: ToolCallback<Input>,
    ) {
        // SDK callbacks use a conditional signature (schema args+context, or
        // context alone). Normalize its callable shape without changing args,
        // context, results, or the SDK's runtime schema validation.
        const invoke = handler as unknown as (...args: Parameters<ToolCallback<Input>>) => ReturnType<ToolCallback<Input>>;
        const guarded = (...args: Parameters<ToolCallback<Input>>) => toolBoundary(() => invoke(...args));
        return this.server.registerTool(name, config, guarded as ToolCallback<Input>);
    }
}
