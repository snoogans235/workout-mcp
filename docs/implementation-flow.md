# High-level implementation flow

Status: proposed implementation design for the confirmed [user flow](user-flow.md). A [local MCP server](../README.md#local-mcp-server) with a read-only status tool exists; the domain flow, database migrations, and workout tools below remain unimplemented.

[FigJam board](https://www.figma.com/board/qIflGPGcLYbqobCjAxmAIl) · [Editable implementation swimlane source](diagrams/implementation-flow.mmd)

## Reading the swimlane

The four vertical lanes show responsibility, with time flowing down the page:
1. User.
2. ChatGPTAgent: the conversational decision maker.
3. McpBackend: Node.js, Express, the MCP SDK, and domain services.
4. PrismaPostgres: the persistence boundary, combining Prisma transactions and PostgreSQL.

The diagram follows one successful set-to-next-target cycle. A workout and an initial exercise/target already exist. Repeat the cycle for each reported set. Setup, staleness, substitutions, and finishing are shown in the separate user-flow diagram; failures are specified below rather than flattened into the successful sequence.

These are logical responsibilities, not four separately deployed services. The MCP backend is one Node application; Prisma runs inside it and connects to PostgreSQL. The ChatGPT agent calls backend tools through the MCP connection. The backend does not independently invoke a model.

## One completed set to the next recommendation

1. User reports actual set measurements and optional feedback.
2. The agent resolves the active workout, actual exercise, and any planned origin, clarifying ambiguous details before calling a write tool.
3. The backend derives authenticated identity and validates ownership, active-session state, exercise-defined JSON shape, equipment compatibility, expected version, and retry key.
4. In a short Prisma transaction, record performed facts, concurrency/version changes, and a retry result. PostgreSQL commits before a success response is returned.
5. Return the saved set identifier/version and enough persisted session context for the agent to assess what comes next.
6. The agent evaluates completed work against the plan and targets, its explicit progression guidance, and current feedback. It chooses another set, another exercise, or finishing. The drawn path continues with another target.
7. The agent submits a revised future target with its expected version and request key.
8. The backend validates and persists that recommendation as a revision, retaining its predecessor and the original prescription. Return stable identifiers.
9. The agent presents the saved next set/exercise target. The user remains in control of performing it.

The recorded fact and the next recommendation are separate operations. If recommendation generation or saving fails, the completed set remains committed and can be retrieved without logging it again. Do not hold a database transaction open while the agent reasons or waits for the user.

## Proposed component boundaries

| Component | Responsibility |
| --- | --- |
| Express and MCP adapter | Protocol transport, authenticated request context, dispatch, structured errors |
| Tool schemas/handlers | Parse inputs and map service results into MCP results |
| Catalog service | Exercise definitions, muscles, movement patterns, exact equipment/location queries |
| Workout service | Active-session lifecycle, set recording, corrections, and plan-origin links |
| Planning service | Plans, proposals, staleness detection, replacement, and future-target revisions |
| Persistence layer | Prisma queries/transactions, constraints, optimistic concurrency, durable retry records |
| ChatGPT instructions/tool metadata | Exercise-led guidance, clarify before recording, save before claiming success, assess next step |

Possible tool boundaries include read_workout_context, record_set, revise_remaining_targets, and finish_workout. Names and full contracts are still proposals; they are not registered MCP tools.

## Failure and branch behavior

- Missing or invalid measurements: return a field-specific error; clarify and retry without writing an invalid set.
- Unauthorized or mismatched records: reject; never trust a user ID in model-supplied arguments.
- Duplicate retry: return the previously committed result for the same request key and input.
- Changed input under the same key: reject the conflict instead of creating an ambiguous duplicate.
- Concurrent edit: reject a stale version, reload current context, and reassess before revising targets.
- Database write failure: do not claim that a set was recorded. Retain the user's reported result for a safe retry.
- Next-recommendation failure: preserve the committed set and continue from saved history when possible.
- Occupied equipment: query alternatives and log actual equipment/exercise against the planned origin. Do not overwrite the long-term plan automatically.
- Expired unstarted proposal: reassess from current context, save a linked replacement, and retain the old proposal.
- Finish or stop: preserve completed work, update the actual session state, and summarize. Unperformed targets stay separate.

## Schema follow-up before implementing writes

The current schema supports the catalog, plans, proposed targets, performed history, and optional plan-origin links. It does not yet provide dedicated append-only target revision history or persistent MCP retry records.

Before implementing adaptive target writes, add an explicit revision model/snapshot strategy that preserves the initial prescription and every changed future recommendation. Link performed work to the target version actually presented, while retaining its original planned origin. Do not silently overwrite PlannedSet.targetDetails and claim the earlier prescription remains recoverable.

Persistent retry keys must be stored atomically with write results. These are identified implementation requirements, not capabilities already implemented by the current Prisma file. This documentation step intentionally leaves the schema unchanged.

## Implementation slices

1. Persist and retrieve a performed set with valid measurements, ownership checks, versioning, and retry deduplication.
2. Retrieve the context the agent needs and return a next-target proposal after successful recording.
3. Add target revision persistence and bind performed sets to the presented target revision.
4. Support exercise alternatives, lifecycle/expiry handling, and finishing.
5. Expose the services through focused MCP tools and verify the full conversational loop.

## Evidence to require

- A reported set survives restart and can be retrieved in a fresh chat.
- A duplicate write request creates exactly one set.
- Invalid JSON, wrong-user links, and stale versions are rejected.
- A next-target revision leaves original targets and completed sets unchanged.
- The agent does not announce a successful save before the committed result.
- Failure to save a recommendation does not undo the already completed set.
- The default interaction offers one next exercise/set target, rather than requiring a whole-workout report.


## Diagram layout status

Both diagrams are on the FigJam board. User-flow routing and swimlane message labels have been repaired and visually checked; see [the current layout status](figjam-status.md).
