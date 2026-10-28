# Workout MCP

A conversation-driven workout planner and journal, centered on a detailed exercise catalog.

Selected stack: TypeScript, Node.js, Express, PostgreSQL, and Prisma. Local development first; deployment later. No application GUI.

## Current status

The TypeScript scaffold builds and runs a readiness greeting. Automated project checks and a GitHub Actions workflow are configured. Express/MCP serving, Prisma runtime integration, migrations, and workout behavior remain planned; an application database is not established by the scaffold.

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

Run an individual stage with `npm run typecheck`, `npm run typecheck:test`, `npm run build`, or `npm test`. Tests use Node's test runner through `tsx`; add `*.test.ts` files under `tests/`. Test sources are checked without emitting files, while the application build emits `src/` to ignored `dist/`.

After building, `npm start` prints `Workout MCP is ready, Jonathan.` and exits. `npm run dev` watches the scaffold for changes. Neither command starts an MCP server yet.

## Schema validation

The schema targets Prisma **7.10.1**. It was formatted and structurally validated in a temporary validation workspace; nothing was applied to a database. SQL generation remains unverified because the preview command returned no output.

With a supported Node runtime (Node 24 was used), from this project directory:

```sh
npx --yes prisma@7.10.1 format --schema prisma/schema.prisma
npx --yes prisma@7.10.1 validate --schema prisma/schema.prisma
```

These commands can download Prisma and are separate from `npm run check`. Prisma packages, connection configuration, migrations, generated client, and production validation rules are future implementation work.


## Agent setup

This project selects reusable agents and skills from the separate `agent_workflows` checkout. Preview and install the project-local copies:

```sh
bash scripts/setup_agents.sh --dry-run
bash scripts/setup_agents.sh
```

If that checkout is not at `../../agent_workflows`, pass `--workflow-repo DIRECTORY` or set `AGENT_WORKFLOWS_DIR`. See [AGENTS.md](AGENTS.md) for the selected agent, roadmap sources, planning boundaries, and tracker setup requirements. Installation does not start planning or create tickets.
