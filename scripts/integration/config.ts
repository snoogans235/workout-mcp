import { requireDatabaseUrl } from "../../src/database/config.js";

export function requireTestDatabaseName(name: string): string {
    if (!/^workout_mcp_test_[a-f0-9]{32}$/.test(name)) {
        throw new Error("Refusing a database outside the generated workout_mcp_test_ namespace.");
    }
    return name;
}

export function requireAdminUrl(value: string | undefined): string {
    try {
        const url = requireDatabaseUrl(value);
        if (decodeURIComponent(new URL(url).pathname.slice(1)).startsWith("workout_mcp_test_")) throw new Error();
        return url;
    } catch {
        throw new Error("Set TEST_DATABASE_ADMIN_URL to an explicit administrative PostgreSQL URL.");
    }
}

export function testDatabaseUrl(adminUrl: string, name: string): string {
    const url = new URL(requireAdminUrl(adminUrl));
    url.pathname = `/${requireTestDatabaseName(name)}`;
    return url.href;
}

export function artifactRequired(mode: string, status: number): boolean {
    if (!["off", "on-failure", "always"].includes(mode)) throw new Error("TEST_DB_ARTIFACT must be off, on-failure, or always.");
    return mode === "always" || (mode === "on-failure" && status !== 0);
}
