# Workout MCP architecture

Status: agreed direction and proposed domain interfaces. A local Express-hosted `/mcp` endpoint and read-only `server_status` tool are implemented; domain services, authentication, and remote connectivity remain planned. See [local server operation and composition](../README.md#local-mcp-server).

## Stack and request flow

TypeScript + Node.js + Express + PostgreSQL + Prisma.

ChatGPT ↔ Express-hosted MCP transport ↔ validated tool handlers ↔ domain services ↔ Prisma ↔ PostgreSQL.

Develop locally first and decide deployment later. No application GUI is planned. ChatGPT is the conversational agent; the proposed backend does not call an LLM API.

## Responsibilities

| Layer | Responsibility |
| --- | --- |
| Agent | Interpret goals/context, propose plans/sessions, choose alternatives, assess history, explain suggestions |
| MCP handlers | Validate inputs, derive authenticated identity, enforce access, return structured results |
| Domain services | Plan/workout lifecycles, JSON measurement validation, expiry decisions, transactions and concurrency |
| Prisma/PostgreSQL | Durable catalog, location/equipment inventory, plans, targets, performed facts, and declared constraints |

The database preserves facts and durable prescriptions. Agent assessments of stimulus or progression are estimates informed by that evidence; they are not definitive muscle-state flags.

## Domain schema

See [data-model.md](data-model.md) and `../prisma/schema.prisma`.

- Catalog: exact exercise variants, equipment models/instances, locations, muscles, and movement patterns.
- Planning: durable TrainingPlan → expiring PlannedSession → PlannedExercise → PlannedSet.
- History: Workout → WorkoutExercise → WorkoutSet, with optional links back to intended targets.
- MeasurementType belongs to Exercise; planned targets and actual measurements are separate JSONB objects.

[Editable FigJam diagrams](https://www.figma.com/board/qIflGPGcLYbqobCjAxmAIl)

## Proposed MCP capabilities

These are design candidates, not registered or frozen tool names.

| Area | Capabilities |
| --- | --- |
| Catalog | Find/get exercises, inspect muscles/movement patterns, curate definitions |
| Equipment | Find locations and exact equipment available there |
| History | Read recent workouts and exercise/machine histories |
| Plans | Read/create/revise durable training direction |
| Planned sessions | Save/read proposals and targets, identify stale proposals, accept or supersede them |
| Performed sessions | Start/log/complete workouts and sets, record substitutions, correct reported facts |

MCP uses a protocol endpoint such as /mcp and named tools, not a REST route for every entity. Tool schemas, pagination, ownership, version conflicts, and retry semantics will be specified against the agreed domain services.

## Expiration and adaptation

Four days is the initial configurable staleness interval. A session stores scheduledFor, schedulingTimezone, and validUntil. A stale unstarted proposal requires reassessment; preserve the original and create a linked replacement. Do not erase completed history or automatically reset the general plan.

If equipment is occupied, the agent selects an alternative using catalog attributes, location inventory, and history. Record the actual exercise/machine against the intended planned exercise. Availability reports are temporary context.

## Before remote access

Choose supported ChatGPT connectivity and verify account availability. Implement authenticated user identity, private-data authorization, write validation, retry protection, and deployment/backups. Shared catalog curation rights and private custom entries need decisions before multi-user use.

The existing HTTP endpoint binds only to `127.0.0.1` and serves status metadata without a database connection. No remote connection exists yet.

## References

- [OpenAI MCP server guidance](https://developers.openai.com/plugins/build/mcp-server)
- [Official MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [Prisma 7 schema reference](https://www.prisma.io/docs/orm/v7/reference/prisma-schema-reference)

