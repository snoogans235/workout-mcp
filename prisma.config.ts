import { defineConfig } from "prisma/config";
import { requireDatabaseUrl } from "./src/database/config.js";

export default defineConfig({
    schema: "prisma/schema.prisma",
    migrations: { path: "prisma/migrations" },
    // Generation, formatting and validation need no database connection.
    ...(process.env.DATABASE_URL === undefined ? {} : {
        datasource: { url: requireDatabaseUrl(process.env.DATABASE_URL) },
    }),
});
