#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_root"

node --import tsx --input-type=module -e '
import { requireDatabaseUrl } from "./src/database/config.ts";
try { requireDatabaseUrl(process.env.DATABASE_URL); }
catch (error) { console.error(error.message); process.exit(1); }
'
exec node_modules/.bin/prisma migrate "$@" --config prisma.config.ts
