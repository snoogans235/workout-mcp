# Workout MCP data model

Status: executable Prisma schema draft based on the design discussion. No database has been created or migrated.

- Schema: `../prisma/schema.prisma`
- [Editable FigJam board](https://www.figma.com/board/qIflGPGcLYbqobCjAxmAIl)
- Diagram sources: [catalog](diagrams/catalog.mmd), [planning](diagrams/planning.mmd), [history](diagrams/history.mmd)

## Agreed direction

Use TypeScript, Node.js, Express, PostgreSQL, and Prisma. The exercise catalog is central: distinguish exact equipment-specific exercise variants and retain history for actual machines at actual locations. Initial scope covers repetition-based and timed strength work, including planks; distance-based activity is deferred.

Measurement type belongs to Exercise, not WorkoutSet. Set measurements live in JSONB. Long-term training direction, expiring session proposals, and performed workouts are separate records. The agent proposes and adapts; the backend preserves durable state and validates writes.

## Model inventory

| Area | Model | Responsibility |
| --- | --- | --- |
| Identity | User | Workout owner, timezone, and preferred weight unit |
| Catalog | Exercise | Specific variant, measurement type, movement pattern, optional equipment model |
| Catalog | EquipmentModel | Manufacturer, model name, and equipment category |
| Catalog | EquipmentInstance | Actual piece of equipment, location, label, and notes |
| Catalog | Location | Gym/branch, timezone, optional address |
| Catalog | Muscle | Named muscle with a broader group for filtering |
| Catalog | ExerciseMuscle | Exercise-to-muscle association with PRIMARY or SECONDARY role |
| Planning | TrainingPlan | Durable goals, schedule/progression guidance, version, and staleness policy |
| Planning | PlannedSession | Concrete upcoming session, plan snapshot, scheduled date, expiry, and status |
| Planning | PlannedExercise | Intended exercise, optional exact equipment, order, rationale |
| Planning | PlannedSet | Ordered target details, optional target effort, and warm-up/working role |
| History | Workout | Actual session, user-local date, location, optional times and planned origin |
| History | WorkoutExercise | Actual exercise/machine, order, optional planned origin and substitution reason |
| History | WorkoutSet | Actual JSONB measurements, effort, notes, and optional planned-set link |

UUID primary keys identify records. Array order is persisted using position fields, unique within each parent. The same exercise may appear multiple times in one workout.

## Catalog and equipment

Exercise defines a specific movement/variant. A Hammer Strength iso-row entry and a Life Fitness high-row entry can have independent names, muscle associations, equipment models, and histories.

EquipmentModel describes the design; EquipmentInstance identifies the physical item. Multiple instances may reference one model. Each instance belongs to a location and has a label unique at that location. An Exercise may omit equipmentModelId for exercises that do not require tracked equipment.

History can be queried by exercise, equipment model, exact machine, or workout location. Workout.locationId captures where a session happened so later changes to the machine's current location do not rewrite that fact. When logging a machine, require a workout location and verify the machine is at that location at recording time. equipmentSettings can preserve useful setup details, such as a seat position; its structure needs validation before implementation.

Manufacturer-specific variants use their own Exercise records. Keep measurement type and equipment-model identity immutable once referenced by a planned or performed set. Corrections that change these meanings should create a new exercise variant.

MovementPattern helps shortlist alternatives. ExerciseMuscle enables filtering for primary and secondary muscles and broader muscle groups. These are candidate-selection facts, not a guarantee of equivalent training effect. No percentage stimulus score or definitive “muscle sufficiently worked” flag is stored.

Catalog records have archivedAt where appropriate. Restrictive foreign keys prevent deleting definitions out from under plans or history.

## Set measurements and planned targets

MeasurementType has REPETITIONS, WEIGHTED_REPETITIONS, and DURATION.

Proposed actual detail shapes:

| Exercise measurementType | WorkoutSet.details example |
| --- | --- |
| REPETITIONS | `{"reps":20}` |
| WEIGHTED_REPETITIONS | `{"reps":5,"weight":135,"weightUnit":"lb"}` |
| DURATION | `{"durationSeconds":60}` |

Proposed target shapes:

| Exercise measurementType | PlannedSet.targetDetails example |
| --- | --- |
| REPETITIONS | `{"repsMin":8,"repsMax":12}` |
| WEIGHTED_REPETITIONS | `{"repsMin":8,"repsMax":12,"weight":135,"weightUnit":"lb"}` |
| DURATION | `{"durationSecondsMin":30,"durationSecondsMax":45}` |

Targets may omit a load until the agent has enough context to propose one. Actual measurements must contain the fields required by the exercise type. Weight units are explicit; missing load must not silently mean zero. The sample JSON shapes are proposals for runtime validators, not validators implemented by this schema.

Prisma declares JSONB columns but does not enforce these object shapes. Before exposing tools, add runtime schemas that reject unknown fields, require positive whole-number repetitions, positive durations, nonnegative loads, lb/kg units, and ordered target ranges. effortRpe and targetEffortRpe, when provided, must be between 1 and 10.

SetRole distinguishes WARMUP and WORKING so future analysis can consider that context. Each set defaults to WORKING; the user can supply a different role.

Bodyweight, assistance, per-hand versus total weight, and weighted holds need explicit measurement semantics before those variants are added. Do not infer them from an unqualified weight. Extend the measurement enum and validators when needed.

A substitution can use a different measurement type from the intended exercise. Validate actual details against the actual Exercise, and targetDetails against the planned Exercise. Do not compare unlike measurements as if they were interchangeable.

## Plans, versions, and expiration

TrainingPlan contains durable goals and guidance. The agent generates PlannedSession records using that guidance, history, and current context. It stores planned exercises and individual planned set targets in the backend.

PlannedSession captures planVersion and planSnapshot. The snapshot should contain the plan's name, goals, schedule/progression guidance, and staleness policy at generation time. Keep it immutable so later plan edits do not change the meaning of an earlier proposal. It is not the place to store private reasoning traces.

scheduledFor is a calendar date interpreted in schedulingTimezone; validUntil is an absolute timestamp. staleAfterDays defaults to 4 as a configurable interpretation of the discussion, not a fixed training rule. When generating a session, compute and store its exact expiry from the scheduled local date and chosen policy. Date-boundary behavior must be made explicit in the service.

A not-yet-started PROPOSED or ACCEPTED session is stale when now is at or beyond validUntil. Staleness is derived; the database does not mark a row expired by itself. The agent must reassess before starting it. Already-started sessions require an explicit continuation/reassessment decision rather than automatic deletion.

After reassessment, create a replacement proposal linked through replacesSessionId and mark the old session SUPERSEDED in one transaction. Preserve old proposals and all performed records. Staleness never erases progression or automatically resets the general TrainingPlan.

Versions support optimistic concurrency. They must be checked and incremented atomically by services. A version column alone does not prevent stale writes.

## Performed history and substitutions

A Workout may link to a PlannedSession, but spontaneous workouts are allowed. WorkoutExercise identifies the exercise actually performed and may link to its intended PlannedExercise. A substitutionReason explains a departure without editing the original prescription.

WorkoutSet may link to a PlannedSet, allowing comparison while preserving the exact actual details. Unplanned exercises and extra sets simply omit those links. A plan is never completed merely because it was generated.

Workout supports IN_PROGRESS, COMPLETED, and ABANDONED sessions so sets can be logged while training. An in-progress workout may temporarily have no exercises. Completed sessions must contain at least one performed exercise with recorded sets; enforce completion rules in services.

performedOn and timezone preserve day-level history without inventing an exact start time. startedAt and completedAt are optional actual times. equipmentInstanceId identifies the precise machine used; equipment availability such as “occupied right now” remains temporary session context.

## Integrity boundaries

Implemented by schema declarations:
- Required fields and enum membership.
- Foreign-key existence with restrictive deletes.
- Unique exercise/muscle slugs and equipment labels within a location.
- Unique exercise and set positions within their parent.
- Composite plan/session ownership relations: a session must belong to its plan's user; a linked workout must belong to its planned session's user.
- Indexes for exercise, equipment, muscle, session status/expiry, and chronological workout lookups.

Required before write tools are production-ready:
- Authenticate identity and scope all private reads/writes; foreign keys are not authorization.
- Verify a WorkoutExercise's plannedExerciseId belongs to the workout's linked PlannedSession.
- Verify a WorkoutSet's plannedSetId belongs to the performed exercise's linked PlannedExercise.
- Verify equipment instance/model compatibility and recording-time location.
- Keep replacements on the same user/plan, reject replacement cycles, and restrict lifecycle transitions.
- Validate JSON shapes, ranges, units, timezones, positive positions, staleness policy, and timestamps.
- Enforce exercise measurement immutability once referenced.
- Apply appropriate SQL CHECK constraints or triggers in a reviewed migration where Prisma cannot express these invariants.
- Use atomic transactions, version checks, and persistent retry keys for MCP writes. Retry-key storage is a separate transport concern not included in these 14 domain models.

## Deliberate first-draft assumptions

The schema currently uses a shared catalog and shared location inventory. Private custom exercises and location membership were discussed as possibilities but not settled; add ownership/visibility rules before a multi-user rollout.

One exercise references at most one equipment model. One workout records one location. Alternatives are selected by querying catalog attributes and history; no permanent equivalence table is assumed.

Manufacturer/model matching uses stable IDs, not name uniqueness. Exercise and muscle slugs are unique. Muscle groupName is an initial grouping label; a managed hierarchy can be added when needed.

Training-plan acceptance and progression behavior remain agent/service policies. The schema records their results and provenance; it does not implement a coach.

## Verification and status

Prisma 7.10.1 format and validate passed for the saved schema, which declares 14 models and 9 enums. A database-free migration-diff command exited successfully but produced no SQL; SQL generation is therefore unverified. Structural validation does not verify business behavior or apply anything to PostgreSQL.

No application dependencies were installed in this project. The validator was installed in a temporary workspace. No database, migration, generated application client, HTTP server, or MCP tool was created.

[Prisma 7 schema reference](https://www.prisma.io/docs/orm/v7/reference/prisma-schema-reference)

