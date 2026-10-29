import { loadEnvFile } from "node:process";

/** Resolve from this module so source and compiled entry points share the root file. */
export function loadProjectEnv(path = new URL("../.env", import.meta.url)): void {
    try {
        loadEnvFile(path);
    } catch (error) {
        if (error instanceof Error && "code" in error && error.code === "ENOENT") return;
        throw new Error("Unable to load the project .env file. Check its permissions and format.");
    }
}
