#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_root"

node --import tsx --input-type=module -e '
import { createDatabase } from "./src/database/index.ts";
let database;
try {
    database = createDatabase(process.env.DATABASE_URL);
    await database.connect();
    console.log("Database connection succeeded.");
} catch (error) {
    console.error("Database lifecycle check failed. Supply a valid DATABASE_URL and verify the selected database is reachable.");
    process.exitCode = 1;
} finally {
    if (database) await database.disconnect();
}
'
