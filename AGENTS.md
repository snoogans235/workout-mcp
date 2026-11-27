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
- .codex/agents/workout_release_assessor.toml: milestone readiness assessment and confirmed GitHub releases.
- .codex/agents/workout_agent_documenter.toml: focused technical context for future agents.
- .codex/agents/workout_internal_documenter.toml: developer and maintainer guidance.
- .codex/agents/workout_user_documenter.toml: conversational product guidance for end users.
- .agents/skills/ticket-writing/: shared plain-language ticket conventions.
- .agents/skills/workflow-pr/: PR conventions and judgment-based sizing guidance.
- .agents/skills/workflow-commit/: commit conventions and tracker-independent ticket verification.
- .agents/skills/workflow-youtrack/: YouTrack ticket operations.
- .agents/skills/workflow-release/: YouTrack-based version proposals, annotated tags, and GitHub Release publication after confirmation.

The generated directories are ignored by Git. Modify reusable definitions in agent_workflows and rerun setup; do not maintain competing copies here. Setup preserves identical files and refuses conflicting copies. Review differences before using --force. Installation is project-local and does not alter personal/global agents or skills. If the agent is not available in an already-open chat, start a new project chat after setup.

## Project-owned workflow

This project decides which agents to use and how to sequence their work. The shared repository supplies reusable roles and skills; installing them does not start work or authorize ticket creation.

The planning role is workout_roadmap_design, selected in .agent-workflow. Invoke it when the developer requests roadmap planning or ticket decomposition, not merely when opening the project. Its assignment starts at docs/roadmap.md unless the developer supplies a different source.

The agent follows supporting references, inspects the implementation, searches existing work, and proposes a matching Epic and small, executable Story breakdown. It may create or update the Epic planning summary when the developer authorizes roadmap capture. Detailed Stories are created or updated only after the developer approves the breakdown. Reuse existing decisions and authorization; do not ask for the same approval again.

Stories may be intended for coding, independent testing, or documentation agents. Identify the intended role, concrete outcome, acceptance conditions, verification expectations, dependencies, and release condition. Do not introduce a mandatory Task layer or a fixed coding-to-testing-to-documentation sequence. Keep each assignment coherent and small; approximately 300 changed lines is a planning signal, not a hard limit.

Record planning summaries, source references, coverage, decisions, approval, and ticket links in the Epic. Stories hold the executable assignments. Keep status and blockers in the tracker. Do not create a parallel planning document in docs/. Flag specification gaps for documentation follow-up; do not let the planning agent implement product code, tests, schemas, or documentation.

Delivery is coordinated by workout_workflow_coordinator. Read .agent-workflow for the actual role mappings, required roles, stage order, base branch, repair budget, and permission policy. Do not select a substitute merely because another agent is installed. Required roles must be available in the active session; an on-disk definition alone is not proof of availability.

The default delivery sequence is code -> independent test -> commit the passing candidate -> verify ticket acceptance at that commit -> assess and complete required documentation -> publish PR -> check the Epic for release assessment eligibility. Production defects return to the selected coder; affected verification repeats before a new commit and ticket reconciliation. Three repair rounds are the default limit; return persistent or ambiguous blockers to the developer. A concrete user assignment may request an earlier stopping point.

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

## Release assessment and publication

The release role is workout_release_assessor. The coordinator runs check_release after delivery and on an explicitly resumed post-merge/ticket-transition check. It checks all open descendants of the assigned ticket's Epic within the WOR project scope defined below, including nested Tasks and excluding the Epic itself. A complete zero result invokes the assessor; remaining open tickets prevent dispatch. An unknown or incomplete result is a reported gap. PR publication does not establish a Done ticket or start a background watcher; the later merge owner or resumed coordinator must rerun the check when the ticket states change.

The developer defines this project's release-check boundary as the full YouTrack WOR project (Workouts), rather than a separate agile-board or sprint view. For this workflow, the shared agent's current-board scope means project: WOR, with no additional sprint, column, or backlog filter; a separate board ID is not required. Verify the actual Epic/child links, all descendant coverage, pagination, and sufficient permissions. The live project schema identifies the lifecycle field as Stage with Backlog, Develop, Review, Test, Staging, and Done. For this release gate, descendants in any of those stages except Done remain open. Reverify these values at execution and report unknown/missing stages instead of assuming completion. Record WOR, the Epic, effective scope/query, observation time, and evidence in the handoff. This explicitly supplied project-wide scope takes precedence over the reusable board-selection default.

Zero open scoped tickets triggers assessment, not release approval. The assessor verifies required work is merged into main, and reconciles the full main release range with YouTrack, including changes from other Epics. It always reports gaps with evidence, owner, and next action. Neither the assessor nor the coordinator dispatches repairs from that release report. Reuse an unchanged assessment or pending proposal when its evidence still matches; reopenings, changed scope, changed main, or new evidence require reassessment.

Release from the verified main HEAD to the repository configured by origin, currently https://github.com/snoogans235/workout-mcp. Reverify that destination and the exact main SHA at release time. Require successful Project checks for the candidate: the database-free aggregate check, generated tool-reference check, and isolated PostgreSQL integration job, or equivalent verified evidence required by the current CI definition. Confirm required documentation coverage and report missing checks rather than starting shared services or changing the product to obtain a pass. Package metadata alone does not establish a prior release tag or the correct first release version.

Use workflow-release to propose major.minor.hotfix, the exact tag/commit, ticket-linked notes, and the complete publication plan. The user confirms that concrete proposal before any release mutation. Confirmation authorizes creating the annotated tag, pushing only that tag, and immediately publishing its GitHub Release with the approved notes; there is no separate draft-review step. If main advances before tagging, reassess and reconfirm the new candidate. Do not move existing tags, publish packages, deploy, or change YouTrack states as part of release publication. Return the verified release URL and actual tag/publication status, including partial failures.

## Tracker and delivery conventions

YouTrack project WOR (Workouts) is the verified tracker project. The current lifecycle field is Stage, with Backlog, Develop, Review, Test, Staging, and Done. Use Stage when applying the delivery transitions described above, and reverify the live mapping before writes. Discover the actual Epic markers and parent/child relationships from current issues; do not assume a Type field, another project's identifiers, or create YouTrack configuration. Installing the skill does not establish a connection or credentials.

Use the installed ticket-writing and workflow-youtrack skills for authorized ticket work. Write plain, outcome-focused tickets that a teammate can understand without reading the conversation. Never claim an unverified ticket operation succeeded.

For later authorized delivery, follow workflow-commit and workflow-pr. Commits use verified ticket IDs and change tags. PR titles use <TICKET-ID>: <Summary> without tags. Use the project-owned branching and authorization rules above. Resolve actual tracker states before transitions; PR publication is not ticket completion or permission to merge.

## Development boundaries

Use Bash for repository scripts. The declared development environment is in flake.nix; scripts/dev.sh manages the existing local PostgreSQL cluster. Do not start services or apply migrations for a read-only planning assignment. Inspect package.json for current build and typecheck commands; do not report unrun checks as passing.

When changing Prisma configuration, generated-client handling, or database lifecycle, read [Prisma and database configuration](README.md#prisma-and-database-configuration) and the following migration workflow before editing.

When changing integration-test database isolation, cleanup, or dump artifacts, read [PostgreSQL integration tests](README.md#postgresql-integration-tests) before editing.

When changing local database loading, read [Local database replacement](README.md#local-database-replacement). Keep static guards/reset SQL separate from archive-supplied application schema, and preserve the single transaction for reset and restore. Verification may replace only generated, owned disposable test databases.

When changing MCP transport, tool composition, logging, application errors, or listener lifecycle, read [Local MCP server](README.md#local-mcp-server) before editing. Tool registries receive the shared `ToolRegistrar` constructed in `createServer`; register plain handlers through it so error handling remains automatic. Keep public error metadata in `ErrorDefinitions`.

When changing published tool metadata or reference generation, read [Generated MCP tool reference](README.md#generated-mcp-tool-reference). Author descriptions, schemas, and annotations in tool modules, then regenerate `docs/tool-reference.md`; do not edit the generated reference by hand. Run `npm run docs:tools:check` alongside the aggregate check for tool changes.
