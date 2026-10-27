# Adaptive workout user flow

Status: confirmed conversational behavior; implementation is still planned.

[FigJam flow and schema board](https://www.figma.com/board/qIflGPGcLYbqobCjAxmAIl) · [Editable flow source](diagrams/user-flow.mmd)

## Main interaction

The agent gives the user one exercise and a target for the next set. The user performs the set and reports the result. The backend records those facts. The agent then adjusts what to do next.

This is exercise-led, set-by-set guidance. A fixed whole-workout prescription is not the default interaction. The user can still end early, request a substitution, or correct a reported fact.

## Prepare the session

1. The user says they are ready to train and supplies relevant context, such as location or time available.
2. The agent reads durable goals/training direction, recent history, equipment at that location, and any upcoming or active session.
3. If no general training plan exists, establish goals and training direction first. If an unstarted session is absent or stale, generate or reassess it from current context.
4. Save the concrete proposed session, planned exercises, targets, rationale, and expiry. Confirm intent to begin and create the performed Workout independently of the proposal.
5. If a workout is already in progress, resume it rather than duplicating it; an expired proposal does not silently delete an active workout.

The four-day interval remains a configurable example of staleness, not a guaranteed training rule.

## Repeat for each set

1. Recommend a specific exercise and the next set target using the plan, history, already completed work, and current context.
2. If the equipment is occupied or unsuitable, offer an alternative using movement pattern, muscles, available equipment, and relevant personal history.
3. The user performs the set and reports measurements and, optionally, effort or other feedback.
4. Ask about missing or ambiguous measurements; do not invent repetitions, load, units, duration, or effort.
5. Record the actual exercise, machine, location, and set details. Preserve the link to the original planned exercise/set when applicable.
6. Only after a successful save, acknowledge the recorded result and decide whether to adjust the next set, move to another exercise, or finish.
7. Show one actionable next exercise/set target and repeat.

The agent makes the next-step assessment. The backend validates data, ownership, state, and consistency. Neither the diagram nor the schema provides an implemented progression or stimulus algorithm.

## Adapt without rewriting history

- Completed set facts stay intact unless the user explicitly corrects them.
- A substitution records the actual exercise/machine against the original intent; it does not automatically rewrite the long-term plan.
- Future target adjustments must preserve the original prescription and any earlier recommendation history. Revision storage still needs an explicit schema/service design before implementation.
- “Occupied right now” is session context; it is not a permanent equipment attribute.
- Stimulus/progress assessments use recorded evidence and explicit training guidance. They remain estimates, not definitive muscle-state flags.

## Finish and resume

When the session is finished or the user stops, save its actual completion/abandonment state and summarize performed work. Planned but unperformed sets never become history automatically. Future recommendations use the performed history.

If saving a set fails, keep the user's reported result available for retry, explain that it has not been saved, and reuse the same request key. Do not claim success or advance based on an uncommitted write. A retry must not create a duplicate set.

## Design acceptance examples

- The agent recommends an exercise and target; a reported set is saved before the next recommendation is assessed.
- Reps/load results and a plank's duration use their own exercise-defined measurement schemas.
- Equipment occupancy leads to a suitable alternative while preserving the planned origin.
- An unclear unit is clarified before recording.
- A stale unstarted proposal is reassessed; completed history and an active workout remain intact.
- A failed write is retried without duplication or a false success message.
- Ending early preserves completed work and leaves unperformed targets separate.


## Diagram layout status

Both diagrams are on the FigJam board. User-flow routing and swimlane message labels have been repaired and visually checked; see [the current layout status](figjam-status.md).
