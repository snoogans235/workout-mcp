import type { McpServer, StandardSchemaWithJSON, ToolCallback } from "@modelcontextprotocol/server";
import { authenticatedRequest } from "../../authentication/requests.js";
import { type WorkoutScope, requireScope, workoutScopes } from "../../authentication/scopes.js";
import { toolBoundary } from "../../diagnostics/errors.js";

type ToolMetadata = Omit<Parameters<McpServer["registerTool"]>[1], "inputSchema" | "outputSchema">;

const policies = new WeakMap<McpServer, Map<string, WorkoutScope>>();

export function requiredToolScope(server: McpServer, name: string): WorkoutScope | undefined {
    return policies.get(server)?.get(name);
}

/** Tool modules receive this boundary rather than an unguarded SDK server. */
export class ToolRegistrar {
    private readonly scopes = new Map<string, WorkoutScope>();

    constructor(private readonly server: McpServer) {
        policies.set(server, this.scopes);
    }

    registerTool<Output extends StandardSchemaWithJSON, Input extends StandardSchemaWithJSON | undefined = undefined>(
        name: string,
        config: ToolMetadata & { requiredScope: WorkoutScope; inputSchema?: Input; outputSchema?: Output },
        handler: ToolCallback<Input>,
    ) {
        const { requiredScope, ...metadata } = config;
        if (!workoutScopes.includes(requiredScope)) {
            throw new Error("Tool scope configuration is invalid.");
        }

        // SDK callbacks use a conditional signature (schema args+context, or
        // context alone). Normalize its callable shape without changing args,
        // context, results, or the SDK's runtime schema validation.
        const invoke = handler as unknown as (...args: Parameters<ToolCallback<Input>>) => ReturnType<ToolCallback<Input>>;
        const guarded = (...args: Parameters<ToolCallback<Input>>) => toolBoundary(() => {
            requireScope(authenticatedRequest().scopes, requiredScope);
            return invoke(...args);
        });
        const registered = this.server.registerTool(name, metadata, guarded as ToolCallback<Input>);
        this.scopes.set(name, requiredScope);
        return registered;
    }
}
