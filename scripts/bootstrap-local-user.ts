import { createDatabase } from "../src/database/index.js";
import { loadProjectEnv } from "../src/environment.js";
import { bootstrapLocalUser } from "../src/identity/users.js";

let database: ReturnType<typeof createDatabase> | undefined;
try {
    loadProjectEnv();
    database = createDatabase(process.env.DATABASE_URL);
    await database.connect();
    await bootstrapLocalUser(database.client, {
        displayName: process.env.LOCAL_USER_DISPLAY_NAME ?? "local",
        timezone: process.env.LOCAL_USER_TIMEZONE ?? "America/Indiana/Indianapolis",
    });
    console.log("Local bootstrap user is available (unlinked; no authentication bypass).");
} catch {
    console.error("Local bootstrap failed. Check configuration and apply reviewed identity migrations first.");
    process.exitCode = 1;
} finally {
    if (database) {
        await database.disconnect();
    }
}
