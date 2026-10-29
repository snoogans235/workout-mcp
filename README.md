# Workout MCP

A conversation-driven workout planner and journal, centered on a detailed exercise catalog.

Selected stack: TypeScript, Node.js, Express, PostgreSQL, and Prisma. Local development first; deployment later. No application GUI.

## Current status

The TypeScript scaffold builds and runs a readiness greeting. Automated project checks, Prisma client generation, an explicit database lifecycle boundary, and migration commands are implemented. Express/MCP serving, application migrations, and workout behavior remain planned. Live PostgreSQL connection and resource-release verification is still pending; the scaffold does not establish an application database.

- Prisma schema: `prisma/schema.prisma`
- [Data model and remaining invariants](docs/data-model.md)
- [Architecture](docs/architecture.md)
- [Roadmap](docs/roadmap.md)
- [FigJam schema diagrams](https://www.figma.com/board/qIflGPGcLYbqobCjAxmAIl)

The model covers exact exercise/equipment variants, locations, muscles, durable training plans, expiring session targets, and performed workouts linked to those targets.

## Development and checks

Use Node 24 and npm. On Apple Silicon macOS, the declared Nix environment supplies Node 24; enter it with `nix develop`. From the project directory:

```sh
npm ci
npm run check
```

`npm ci` installs the committed lockfile dependencies. `npm run check` runs application typechecking, test-source typechecking, compilation, and unit tests in order, stopping with a nonzero exit status on failure. These checks need no database, credentials, or running services. GitHub Actions uses the same install and check commands for pull requests and pushes to `main`.

Run an individual stage with `npm run typecheck`, `npm run typecheck:test`, `npm run build`, or `npm test`. Tests use Node's test runner through `tsx`; add `*.test.ts` files under `tests/`. Test sources and `prisma.config.ts` are checked without emitting files, while the application build emits `src/` to ignored `dist/`.

After building, `npm start` prints `Workout MCP is ready, Jonathan.` and exits. `npm run dev` watches the scaffold for changes. Neither command starts an MCP server yet.

## Prisma and database configuration

Prisma CLI, client, and PostgreSQL adapter are pinned to **7.10.1**; `pg` and its types are pinned to **8.23.1**. Root `prisma.config.ts` selects `prisma/schema.prisma` and `prisma/migrations`. After `npm ci`, these commands need no database or `DATABASE_URL`:

```sh
npm run prisma:format
npm run prisma:validate
npm run prisma:generate
```

Generation writes the `prisma-client` output to ignored `src/generated/prisma/`. Application typechecking and builds regenerate it automatically; on a clean checkout, run generation before standalone `npm test` or `npm run typecheck:test`. Generated sources and build output are not committed. Formatting and structural validation do not approve the schema's business rules or apply it to PostgreSQL; see [remaining data-model invariants](docs/data-model.md).

Database operations require an explicitly supplied `DATABASE_URL` with PostgreSQL protocol, user, host, port, and database. Include a URL-encoded password when authentication requires it. No `.env` loader is configured: export the variable in the invoking shell. This non-secret example matches the launcher's TCP endpoint; replace both example names with a deliberately selected existing role and database:

```sh
export DATABASE_URL='postgresql://example_role@127.0.0.1:55432/example_database'
npm run database:check
```

The check connects, runs `SELECT 1`, and disconnects; it does not create tables, migrate, or start PostgreSQL. Success prints `Database connection succeeded.` Missing/malformed configuration is rejected before driver fallback; connection failures produce a sanitized message. Verify the selected database is already reachable if the check fails. Live connect/disconnect and resource release have not yet been verified against a selected database.

For application integration, import `createDatabase` from `src/database/index.ts`, construct it once with explicit configuration, and share its `client` rather than constructing a pool per request. Import and construction do not connect. Await `connect()` explicitly and await `disconnect()` during shutdown or in a `finally` block; shutdown disconnects Prisma and ends the pool. The readiness-greeting entry point does not invoke this boundary.

## Migration workflow

The domain schema is a review draft. No initial migration has been created or applied, and its remaining constraints must be reviewed before application. The following commands are available for later authorized migration work; do not use them to apply the current draft to a normal developer database.

| Command | Purpose |
| --- | --- |
| `npm run migrate:status` | Inspect migration status for the explicitly configured database. |
| `npm run migrate:create -- --name NAME` | Use development migration tooling with `--create-only`, then review generated SQL under `prisma/migrations`. |
| `npm run migrate:dev` | Create/apply development migrations after review in an appropriate development environment. |
| `npm run migrate:deploy` | Apply already committed migrations in a deployment environment. |

All migration commands validate `DATABASE_URL` before invoking Prisma. Development migration commands use Prisma's shadow-database workflow and can require database creation privileges; `--create-only` is not a general read-only database check. Select the target and required permissions deliberately. No migration command is part of `npm run check`, and no reset or seed workflow is provided here.


## Agent setup

This project selects reusable agents and skills from the separate `agent_workflows` checkout. Preview and install the project-local copies:

```sh
bash scripts/setup_agents.sh --dry-run
bash scripts/setup_agents.sh
```

If that checkout is not at `../../agent_workflows`, pass `--workflow-repo DIRECTORY` or set `AGENT_WORKFLOWS_DIR`. See [AGENTS.md](AGENTS.md) for the selected agent, roadmap sources, planning boundaries, and tracker setup requirements. Installation does not start planning or create tickets.
