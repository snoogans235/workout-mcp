# Workout MCP

A conversation-driven workout planner and journal, centered on a detailed exercise catalog.

Selected stack: TypeScript, Node.js, Express, PostgreSQL, and Prisma. Local development first; deployment later. No application GUI.

## Current status

Domain schema and planning artifacts only. No application runtime or database has been set up in this directory.

- Prisma schema: `prisma/schema.prisma`
- [Data model and remaining invariants](docs/data-model.md)
- [Architecture](docs/architecture.md)
- [Roadmap](docs/roadmap.md)
- [FigJam schema diagrams](https://www.figma.com/board/qIflGPGcLYbqobCjAxmAIl)

The model covers exact exercise/equipment variants, locations, muscles, durable training plans, expiring session targets, and performed workouts linked to those targets.

## Schema validation

The schema targets Prisma **7.10.1**. It was formatted and structurally validated in a temporary validation workspace; nothing was applied to a database. SQL generation remains unverified because the preview command returned no output.

With a supported Node runtime (Node 24 was used), from this project directory:

```sh
npx --yes prisma@7.10.1 format --schema prisma/schema.prisma
npx --yes prisma@7.10.1 validate --schema prisma/schema.prisma
```

These commands can download Prisma. Project dependencies, Prisma connection configuration, migrations, generated client, and production validation rules are future implementation work.

