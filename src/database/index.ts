import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { PrismaClient } from "../generated/prisma/client.js";
import { requireDatabaseUrl } from "./config.js";

/** Construct once at application startup and share client across request handlers. */
export function createDatabase(databaseUrl: string | undefined) {
    const pool = new Pool({
        connectionString: requireDatabaseUrl(databaseUrl),
        connectionTimeoutMillis: 5_000,
    });
    const client = new PrismaClient({ adapter: new PrismaPg(pool) });

    return {
        client,
        async connect(): Promise<void> {
            await client.$connect();
            // Adapter construction is lazy; prove connectivity without domain tables.
            await client.$queryRaw`SELECT 1`;
        },
        async disconnect(): Promise<void> {
            try {
                await client.$disconnect();
            } finally {
                await pool.end();
            }
        },
    };
}
