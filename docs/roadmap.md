# Implementation roadmap

## Completed design artifacts

- Stack chosen: TypeScript, Node.js, Express, PostgreSQL, Prisma.
- Domain schema written in `../prisma/schema.prisma`.
- Prisma 7.10.1 formatting and structural validation passed.
- Database-free SQL preview produced no output; SQL generation is unverified. No SQL was applied.
- FigJam original draft replaced by catalog, planning, and workout-history diagrams.

## Implemented development foundation

The repository contains a Node/TypeScript scaffold, a readiness-greeting unit test, separate application and test-source typechecks, a source-only build, and a shared local/CI check command. See [development and checks](../README.md#development-and-checks). The Nix environment declares Node 24 and PostgreSQL 18, and `scripts/dev.sh` manages an already-initialized local cluster; this does not establish an application database or migration state.

Prisma 7.10.1 packages, configuration, ignored client generation, migration commands, and an explicit reusable client/pool boundary are implemented. Database-free verification and read-only connection, disconnection, and resource release against an existing database through a Unix socket pass. See [Prisma configuration](../README.md#prisma-and-database-configuration).

The separate [PostgreSQL integration command](../README.md#postgresql-integration-tests) creates and cleans up a unique test database per invocation, verifies transaction rollback/isolation, and optionally retains validated local test dumps. The migration set is empty, so these checks do not prove domain-schema behavior. A dedicated PostgreSQL 18 CI job is configured with artifacts disabled; CI upload access policy remains unresolved.

## Next implementation stages

1. Review the schema assumptions in [data-model.md](data-model.md): catalog visibility, load semantics, one-location sessions, plan staleness boundaries, and measurement validators.
2. Review and create the initial domain migration with required CHECK constraints/triggers. The schema draft has not been applied to an application database.
3. Implement the catalog and equipment queries. Verify exact exercise/machine histories can be distinguished and catalog definitions cannot be deleted out from under records.
4. Implement runtime measurement validation and performed workout persistence. Verify atomic writes, units, ownership, ordering, corrections, and durability after restart.
5. Implement durable plans, planned sessions/targets, plan snapshots, and stale-session replacement. Test expiry boundaries and concurrent updates.
6. Add Express and the official MCP SDK. Define focused tool contracts, annotations, structured errors, and persistent retry-key protection. Test protocol discovery and representative/invalid calls.
7. Connect ChatGPT through the selected hosting/private-connectivity option. Verify identity, permission boundaries, backups, and a complete plan-to-workout conversation.

## End-to-end acceptance scenarios

- Log repetitions for push-ups, load/repetitions for a machine exercise, and duration for a plank; reject the wrong JSON shape for each.
- Find separate histories for two equipment-specific row variants and for two physical machines of one model.
- Save a generated planned session and target sets without creating performed history.
- Substitute an exercise while recording the actual machine and retaining the original planned target.
- Log a spontaneous workout with no planned origin.
- Mark an unstarted session stale at its stored expiry; preserve the old proposal while recording a replacement.
- Retrieve identical history after restart and from a fresh conversation.
- Reject cross-user plan links and mismatched planned-exercise/set links.
- Retry a write without duplicating rows and reject stale corrections.

No Express/MCP server, application migrations, or workout business-behavior tests exist yet.


## Adaptive workout interaction

The confirmed [user flow](user-flow.md) and [implementation swimlane](implementation-flow.md) define the exercise-led, set-by-set loop. Before implementing adaptive target writes, extend the schema with explicit target revision history and persistent retry records. Preserve the initial prescription, the target actually presented, and completed set facts separately.
