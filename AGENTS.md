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

AGENT_WORKFLOWS_DIR can also supply that source directory. The script installs only the project's selected components:

- .codex/agents/workout_roadmap_design.toml: the project-prefixed roadmap design agent.
- .agents/skills/ticket-writing/: shared plain-language ticket conventions.
- .agents/skills/workflow-pr/: PR conventions and judgment-based sizing guidance.
- .agents/skills/workflow-commit/: commit conventions and tracker-independent ticket verification.
- .agents/skills/workflow-youtrack/: YouTrack ticket operations.

The generated directories are ignored by Git. Modify reusable definitions in agent_workflows and rerun setup; do not maintain competing copies here. Setup preserves identical files and refuses conflicting copies. Review differences before using --force. Installation is project-local and does not alter personal/global agents or skills. If the agent is not available in an already-open chat, start a new project chat after setup.

## Project-owned workflow

This project decides which agents to use and how to sequence their work. The shared repository supplies reusable roles and skills; installing them does not start work or authorize ticket creation.

The currently selected agent is workout_roadmap_design. Invoke it when the developer requests roadmap planning or ticket decomposition, not merely when opening the project. Its assignment starts at docs/roadmap.md unless the developer supplies a different source.

The agent follows supporting references, inspects the implementation, searches existing work, and proposes a matching Epic and small, executable Story breakdown. It may create or update the Epic planning summary when the developer authorizes roadmap capture. Detailed Stories are created or updated only after the developer approves the breakdown. Reuse existing decisions and authorization; do not ask for the same approval again.

Stories may be intended for coding, independent testing, or documentation agents. Identify the intended role, concrete outcome, acceptance conditions, verification expectations, dependencies, and release condition. Do not introduce a mandatory Task layer or a fixed coding-to-testing-to-documentation sequence. Keep each assignment coherent and small; approximately 300 changed lines is a planning signal, not a hard limit.

Record planning summaries, source references, coverage, decisions, approval, and ticket links in the Epic. Stories hold the executable assignments. Keep status and blockers in the tracker. Do not create a parallel planning document in docs/. Flag specification gaps for documentation follow-up; do not let the planning agent implement product code, tests, schemas, or documentation.

Coding, testing, and documentation agent definitions and their execution workflow have not yet been configured for this project. Planning does not automatically dispatch implementation. Bring material unknowns to the developer rather than initiating experiments.

## Tracker and delivery conventions

YouTrack is the intended tracker. Its instance, project, existing Epic, issue types, and states have not yet been verified for this project. Discover them through the available integration or ask for the missing mapping before writes. Do not assume another project's identifiers or create YouTrack configuration. Installing the skill does not establish a connection or credentials.

Use the installed ticket-writing and workflow-youtrack skills for authorized ticket work. Write plain, outcome-focused tickets that a teammate can understand without reading the conversation. Never claim an unverified ticket operation succeeded.

For later authorized delivery, follow workflow-commit and workflow-pr. Commits use verified ticket IDs and change tags. PR titles use <TICKET-ID>: <Summary> without tags. Do not invent a branching strategy, merge policy, or automatic state transitions; resolve those as part of this project's execution workflow.

## Development boundaries

Use Bash for repository scripts. The declared development environment is in flake.nix; scripts/dev.sh manages the existing local PostgreSQL cluster. Do not start services or apply migrations for a read-only planning assignment. Inspect package.json for current build and typecheck commands; do not report unrun checks as passing.
