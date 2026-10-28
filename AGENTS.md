# Workout MCP agent guidance

## Project context and sources

Build the conversation-driven workout planner and journal described in docs/roadmap.md. The selected stack is TypeScript, Node.js, Express, PostgreSQL, and Prisma; ChatGPT provides the conversational interface. No separate application GUI is planned.

Start with docs/README.md and follow relevant sources:

- docs/roadmap.md: intended implementation stages and end-to-end acceptance scenarios.
- docs/user-flow.md: confirmed exercise-led, set-by-set interaction.
- docs/architecture.md: architecture direction and proposed interfaces.
- docs/data-model.md and prisma/schema.prisma: domain model and outstanding integrity rules.
- docs/implementation-flow.md: component responsibilities, write boundaries, and implementation requirements.
- docs/figjam-status.md and docs/diagrams/: diagram references and editable sources.
- FigJam: https://www.figma.com/board/qIflGPGcLYbqobCjAxmAIl

Inspect actual code and configuration before planning. Some status statements in the existing docs predate the TypeScript scaffold and local development setup. Neither scaffolding nor schema declarations prove business behavior or a migrated database. Distinguish confirmed requirements, proposals, implemented behavior, and unverified claims. Surface consequential conflicts to the developer.

## Install project agents and skills

The reusable definitions live in the separate agent_workflows repository. From this repository:

```sh
bash scripts/setup_agents.sh --dry-run
bash scripts/setup_agents.sh
```

The default source is ../../agent_workflows relative to this repository. For a different checkout:

```sh
bash scripts/setup_agents.sh --workflow-repo /path/to/agent_workflows
```

AGENT_WORKFLOWS_DIR can also supply that source directory. The script reads .agent-workflow and installs its selected roles and skills locally. That file is declarative data, not executable shell code; edit its role mappings to change selections. The current components are:

- .codex/agents/workout_workflow_coordinator.toml: project workflow coordinator.
- .codex/agents/workout_roadmap_design.toml: roadmap discovery and ticket decomposition.
- .codex/agents/workout_typescript_backend_coder.toml: TypeScript backend implementation.
- .codex/agents/workout_backend_tester.toml: independent acceptance, edge, and negative-case testing.
- .codex/agents/workout_agent_documenter.toml: focused technical context for future agents.
- .codex/agents/workout_internal_documenter.toml: developer and maintainer guidance.
- .codex/agents/workout_user_documenter.toml: conversational product guidance for end users.
- .agents/skills/ticket-writing/: shared plain-language ticket conventions.
- .agents/skills/workflow-pr/: PR conventions and judgment-based sizing guidance.
- .agents/skills/workflow-commit/: commit conventions and tracker-independent ticket verification.
- .agents/skills/workflow-youtrack/: YouTrack ticket operations.

The generated directories are ignored by Git. Modify reusable definitions in agent_workflows and rerun setup; do not maintain competing copies here. Setup preserves identical files and refuses conflicting copies. Review differences before using --force. Installation is project-local and does not alter personal/global agents or skills. If the agent is not available in an already-open chat, start a new project chat after setup.

## Project-owned workflow

This project decides which agents to use and how to sequence their work. The shared repository supplies reusable roles and skills; installing them does not start work or authorize ticket creation.

The planning role is workout_roadmap_design, selected in .agent-workflow. Invoke it when the developer requests roadmap planning or ticket decomposition, not merely when opening the project. Its assignment starts at docs/roadmap.md unless the developer supplies a different source.

The agent follows supporting references, inspects the implementation, searches existing work, and proposes a matching Epic and small, executable Story breakdown. It may create or update the Epic planning summary when the developer authorizes roadmap capture. Detailed Stories are created or updated only after the developer approves the breakdown. Reuse existing decisions and authorization; do not ask for the same approval again.

Stories may be intended for coding, independent testing, or documentation agents. Identify the intended role, concrete outcome, acceptance conditions, verification expectations, dependencies, and release condition. Do not introduce a mandatory Task layer or a fixed coding-to-testing-to-documentation sequence. Keep each assignment coherent and small; approximately 300 changed lines is a planning signal, not a hard limit.

Record planning summaries, source references, coverage, decisions, approval, and ticket links in the Epic. Stories hold the executable assignments. Keep status and blockers in the tracker. Do not create a parallel planning document in docs/. Flag specification gaps for documentation follow-up; do not let the planning agent implement product code, tests, schemas, or documentation.

Delivery is coordinated by workout_workflow_coordinator. Read .agent-workflow for the actual role mappings, required roles, stage order, base branch, repair budget, and permission policy. Do not select a substitute merely because another agent is installed. Required roles must be available in the active session; an on-disk definition alone is not proof of availability.

The default delivery sequence is code -> independent test -> commit the passing candidate -> verify ticket acceptance at that commit -> assess and complete required documentation -> publish PR. Production defects return to the selected coder; affected verification repeats before a new commit and ticket reconciliation. Three repair rounds are the default limit; return persistent or ambiguous blockers to the developer. A concrete user assignment may request an earlier stopping point.

The coordinator owns the delivery-state transitions for the assigned ticket. Use workflow-youtrack, verify the project's actual state values before each write, and reread the ticket to confirm the result:

- Move the ticket to `Develop` when active implementation begins. Selecting, planning, or merely assigning the ticket is not enough; the coordinator must have started or resumed its delivery branch and dispatched or begun the coding work.
- Move the ticket to `Review` only after the pull request has been successfully published and its URL and remote head are verified. Leave it in `Develop` if PR publication fails.
- Move the ticket to `Done` only after the pull request is verified as merged. Approval, a submitted PR, or a closed-but-unmerged PR is not completion.

Record the PR URL with the review transition and merge evidence with the done transition. Preserve unrelated ticket fields and human edits. If a required state or tracker operation is unavailable, report the lifecycle gap instead of choosing a misleading substitute. The default delivery assignment ends with the ticket in `Review`; the later merge owner or a resumed coordinator assignment performs the verified `Done` transition.

Ticket verification means reconciling each acceptance condition with evidence for the committed tree. Test/support edits belong to the candidate too. If the final tree differs from the tested candidate, refresh affected verification. Keep the tested commit and limitations in the tracker handoff. Do not blindly rerun all checks when the existing evidence matches the committed candidate.

Use a dedicated ticket branch from the verified main base; confirm the ticket and checkout ownership before creating or resuming it. Choose a readable ticket-based name consistent with existing branches. Never overwrite another checkout or use pending sibling work as an implicit prerequisite. Resolve an existing conflicting branch/base before editing.

Commit, PR publication, and merging require explicit authorization from the developer's actual assignment or standing instructions. The configured workflow order is not permission by itself. A request covering a complete operation remains valid across handoffs; do not ask repeatedly. Prepare reviewable work and stop at an ungranted operation. Default delivery ends at a verified published PR; merging and ticket closure remain separately controlled.

Documentation is conditional on the ticket's actual impact and is routed independently by audience: agents to workout_agent_documenter, internal developers and maintainers to workout_internal_documenter, and end users to workout_user_documenter. Assign only affected audiences; an explained no-update disposition is valid. Required updates follow ticket verification and must be included in the final committed candidate before PR publication, with affected checks refreshed.

Preserve the project's useful existing documentation layout unless a scoped ticket approves a reorganization. AGENTS.md remains the small agent entry point. docs/README.md and the current architecture, data-model, implementation-flow, user-flow, roadmap, FigJam, and diagram sources remain canonical where they already own a fact. New docs/agents, docs/internal, docs/users, or docs/reference material should be created only when the assigned content needs it; do not duplicate shared facts merely to populate the newer audience directories. Give each shared reference or navigation file one owner per assignment.

The coordinator owns dispatch and cross-role status, not production implementation or test authoring. Planning does not automatically start delivery; invoke delivery for an assigned ready ticket. Bring material unknowns to the developer rather than initiating experiments. Installation never starts the workflow.

## Tracker and delivery conventions

YouTrack is the intended tracker. Its instance, project, existing Epic, issue types, and states have not yet been verified for this project. Discover them through the available integration or ask for the missing mapping before writes. Do not assume another project's identifiers or create YouTrack configuration. Installing the skill does not establish a connection or credentials.

Use the installed ticket-writing and workflow-youtrack skills for authorized ticket work. Write plain, outcome-focused tickets that a teammate can understand without reading the conversation. Never claim an unverified ticket operation succeeded.

For later authorized delivery, follow workflow-commit and workflow-pr. Commits use verified ticket IDs and change tags. PR titles use <TICKET-ID>: <Summary> without tags. Use the project-owned branching and authorization rules above. Resolve actual tracker states before transitions; PR publication is not ticket completion or permission to merge.

## Development boundaries

Use Bash for repository scripts. The declared development environment is in flake.nix; scripts/dev.sh manages the existing local PostgreSQL cluster. Do not start services or apply migrations for a read-only planning assignment. Inspect package.json for current build and typecheck commands; do not report unrun checks as passing.
