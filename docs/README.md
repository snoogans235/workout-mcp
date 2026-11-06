# Workout MCP planning

Canonical documentation for `/Users/jnewton/Projects/typescript/workout_mcp`.

- [Development setup and automated checks](../README.md#development-and-checks)
- [Generate and check the MCP tool reference](../README.md#generated-mcp-tool-reference)
- [Generated MCP tool reference](tool-reference.md)
- [Local MCP server](../README.md#local-mcp-server)
- [Authenticated identity and handler context](../README.md#authenticated-identity-and-handler-context)
- [Prisma configuration and migration commands](../README.md#prisma-and-database-configuration)
- [Create the explicit local bootstrap user](../README.md#local-bootstrap-user)
- [Load a supplied local database archive](../README.md#local-database-replacement)
- [PostgreSQL integration tests and artifacts](../README.md#postgresql-integration-tests)
- [Confirmed adaptive workout user flow](user-flow.md)
- [High-level implementation swimlane](implementation-flow.md)
- [FigJam layout status](figjam-status.md)
- [Current domain schema design](data-model.md)
- [Architecture and proposed MCP capabilities](architecture.md)
- [Implementation roadmap](roadmap.md)
- [Editable FigJam schema](https://www.figma.com/board/qIflGPGcLYbqobCjAxmAIl)
- Prisma source: `../prisma/schema.prisma`
- Editable diagram sources: `diagrams/catalog.mmd`, `diagrams/planning.mmd`, `diagrams/history.mmd`

The schema captures the discussed model and documents remaining assumptions. The identity-only migrations are tested in isolated PostgreSQL databases; the remaining catalog, planning, and history schema is an unmigrated design draft. The original FigJam draft was replaced at the user's request.

