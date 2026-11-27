import { loadEnvFile } from "node:process";

export type RuntimeEnvironment = "development" | "test" | "production";
const environments: readonly RuntimeEnvironment[] = ["development", "test", "production"];

/** Resolve from this module so source and compiled entry points share the root file. */
export function loadProjectEnv(path = new URL("../.env", import.meta.url)): void {
    try {
        loadEnvFile(path);
    } catch (error) {
        if (error instanceof Error && "code" in error && error.code === "ENOENT") return;
        throw new Error("Unable to load the project .env file. Check its permissions and format.");
    }
}

export function runtimeEnvironment(env: NodeJS.ProcessEnv = process.env): RuntimeEnvironment {
    const value = env.NODE_ENV;
    if (value === undefined || value === "") return "production";
    if (!environments.some(environment => environment === value)) {
        throw new Error("Set NODE_ENV to development, test, or production.");
    }
    return value as RuntimeEnvironment;
}

export function isDevelopment(env: NodeJS.ProcessEnv = process.env): boolean {
    return runtimeEnvironment(env) === "development";
}