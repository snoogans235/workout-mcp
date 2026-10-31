# Workout MCP

A conversation-driven workout planner and journal, centered on a detailed exercise catalog.

Selected stack: TypeScript, Node.js, Express, PostgreSQL, and Prisma. Local development first; deployment later. No application GUI.

## Current status

The application serves a loopback-only MCP endpoint with one read-only status tool. Automated project checks, Prisma client generation, an explicit database lifecycle boundary, and isolated PostgreSQL tests are implemented. Application migrations, workout behavior, authentication, and remote connectivity remain planned; the local MCP server does not connect to a database.

- Prisma schema: `prisma/schema.prisma`
- [Data model and remaining invariants](docs/data-model.md)
- [Architecture](docs/architecture.md)
- [Roadmap](docs/roadmap.md)
- [FigJam schema diagrams](https://www.figma.com/board/qIflGPGcLYbqobCjAxmAIl)

The model covers exact exercise/equipment variants, locations, muscles, durable training plans, expiring session targets, and performed workouts linked to those targets.

## Development and checks

Use Node 24 and npm. On Apple Silicon macOS, the declared Nix environment supplies Node 24; enter it with `nix develop`. From the project directory:

```sh
npm ci
npm run check
```

`npm ci` installs the committed lockfile dependencies. `npm run check` runs application typechecking, test-source typechecking, compilation, and unit tests in order, stopping with a nonzero exit status on failure. These checks need no database, credentials, or running services. GitHub Actions uses the same install and check commands for pull requests and pushes to `main`.

Run an individual stage with `npm run typecheck`, `npm run typecheck:test`, `npm run build`, or `npm test`. Tests use Node's test runner through `tsx`; add `*.test.ts` files under `tests/`. Test sources and `prisma.config.ts` are checked without emitting files, while the application build emits `src/` to ignored `dist/`.

Run `npm run build` before standalone `npm test`: the server lifecycle tests exercise both source and compiled entry points. `npm run check` already builds before testing. Protocol tests use ephemeral loopback listeners and the official MCP client; they do not need PostgreSQL.

### Generated MCP tool reference

After `npm ci`, generate or verify the [tool reference](docs/tool-reference.md):

```sh
npm run docs:tools:generate
npm run docs:tools:check
```

Generation writes `docs/tool-reference.md`; checking leaves it unchanged and prints `Tool reference is current.` when it matches. GitHub Actions runs the same check after `npm run check` for pull requests and pushes to `main`. It is a separate local command, so run both checks before submitting tool changes.

Author tool descriptions, parameter descriptions, annotations, and schemas in the tool modules registered through `src/server/tools/register-tools.ts`. Regenerate the reference after changing that metadata and commit the generated change with its source. Generation extracts published metadata; it does not supply meaningful prose. The pinned `@cisco_open/mcptoolkit-contract` **2.0.5** CLI extracts mcpdesc **0.8.0** using protocol **2026-07-28**, validates it strictly, and renders its reference-documentation template. An automatically extracted schema/annotation appendix covers fields omitted by that template.

Both commands build and start their own loopback server with an ephemeral port. They need no database, credentials, separately running server, or LLM. To select a port, use `TOOL_REFERENCE_PORT=3001 npm run docs:tools:check`; choose an unused port. The runner removes temporary `workout-tool-reference.*` files under `TMPDIR` (or `/tmp`) and stops its owned process tree on success, failure, `SIGINT`, or `SIGTERM`. Each build/extraction/rendering step has a 120-second timeout, and server readiness polling is bounded.

A missing or stale reference fails with regeneration guidance and, for stale content, a diff. Review the source change, regenerate, and check again. Startup, extraction, validation, or rendering failures also exit nonzero: fix the reported stage before regenerating. For an occupied explicit port, select another port or omit `TOOL_REFERENCE_PORT`; the runner preserves the existing listener.

## Local MCP server

From Node 24 or `nix develop`, start the watch-mode development server:

```sh
MCP_PORT=3000 npm run dev
```

For the compiled entry point:

```sh
npm run build
MCP_PORT=3000 npm start
```

At the default log level, startup writes one newline-delimited JSON record to stdout:

```json
{"level":30,"event":"startup","component":"server","port":3000}
```

Connect at `http://127.0.0.1:3000/mcp`, using the record's selected port. `MCP_PORT` is required and accepts integers from `0` to `65535`; `0` requests an ephemeral port, reported in that record. `MCP_HOST` defaults to `127.0.0.1`; empty or other values are rejected. Both commands load optional project-root `.env` configuration, with exported variables taking precedence. No database configuration is required by the server.

Connect an MCP client using Streamable HTTP at that `/mcp` URL. The only tool is `server_status`, with no arguments (`{}`). It is read-only and returns text plus structured content containing only `status: "ok"`, `service: "workout-mcp"`, and the application version from `package.json`. The official-client tests verify the modern era with negotiated protocol version `2026-07-28`; see [protocol tests](tests/server/application.test.ts).

The MCP v2 split packages are pinned to server/client **2.4.0**, Node adapter **2.1.2**, and Express adapter **2.0.2**, with Express **5.3.0** and Zod **4.6.7**. Exact dependencies remain in `package.json` and the lockfile.

The SDK's Host/Origin protections reject non-local requests. Malformed requests, invalid arguments, unknown tools, and unsupported methods return structured failures without stack traces. This is a local developer transport: no authentication, workout tools, separate health endpoint, or remote/phone connection is provided.

Press Ctrl-C (`SIGINT`) or send `SIGTERM` to stop. Shutdown closes MCP handling, in-flight HTTP connections, and the listener so the port can be reused, emits a `shutdown` event, and flushes diagnostics. If startup fails, check the explicit port, loopback host, and `LOG_LEVEL`; select another port if it is already occupied. The entry point writes a safe `startup_failed` JSON record to stderr and exits unsuccessfully. All startup failures currently use `CONFIGURATION_INVALID`, including an occupied port; the record omits configuration values and stack traces.

For extension, `src/server/application.ts` constructs the unbound app and delegates each request to the fresh-server factory in `src/server/create-server.ts`; it maintains no protocol session store. The factory constructs one `ToolRegistrar` immediately after the SDK server and passes it to `src/server/tools/register-tools.ts`, returning the underlying server for transport and lifecycle handling. Registry functions receive the same `tools: ToolRegistrar` and forward it to tool modules. Each tool owns its schema, annotations, and plain handler, currently `src/server/tools/system/server-status.ts`. Register through `tools.registerTool(...)`: the registrar automatically guards synchronous and asynchronous failures while preserving SDK input inference, callback context, and schema validation. `src/server/listener.ts` owns binding and idempotent shutdown, while `src/index.ts` loads configuration and installs process signal handlers. Importing composition opens no listener and imports no database boundary. Keep new domain capabilities separate from this status-only transport and the [proposed architecture](docs/architecture.md).

### Request diagnostics and safe errors

`LOG_LEVEL` defaults to `info`. Accepted values are `trace`, `debug`, `info`, `warn`, `error`, `fatal`, and `silent`; empty, misspelled, or other values fail before binding. Events use Pino level `30` (info); failures use `50` (error). `warn` or `error` suppress startup, shutdown, and request-completion records while retaining failures; `fatal` and `silent` suppress both. For an ephemeral port, retain `info` or a more verbose level to see the selected port. Pino is exactly pinned to **10.4.0**.

Each HTTP request reaching `/mcp` gets a fresh server-owned UUID in `X-Request-Id`; a supplied ID is replaced. Search JSON logs for that `requestId`. Request child loggers emit one `request_completed` or `request_failed` event with `component: "server"` and `durationMs`. These describe HTTP completion: a tool returning an MCP application error over successful HTTP also produces an `application_failed` record. SDK-owned malformed requests, invalid arguments, and unknown tools retain their protocol behavior.

Application tool failures return `isError: true` with JSON text containing `code`, a safe `message`, `retryable`, and the same `requestId` as the header and failure log. The initial definitions are:

| Code | Client guidance | Retryable |
| --- | --- | --- |
| `CONFIGURATION_INVALID` | Application configuration is invalid. | `false` |
| `DEPENDENCY_UNAVAILABLE` | A required dependency is unavailable. Retry later. | `true` |
| `INTERNAL_ERROR` | An internal error occurred. | `false` |

For a known application failure, throw `new ApplicationError(ErrorDefinitions.DEPENDENCY_UNAVAILABLE, "database", { cause })`, choosing the appropriate definition and component. Frozen entries in `src/diagnostics/error-definitions.ts` own the code, message, retryability, and safe diagnostic cause; logger code/cause vocabularies derive from them. The shared registrar maps unexpected exceptions to the internal-error definition and lets SDK `ProtocolError` pass through to the SDK. Raw exception messages, stacks, and cause objects are excluded from diagnostics and client errors; logs carry only the safe cause category.

`src/diagnostics/logger.ts` permits only validated event/component/code/cause values, UUIDs, booleans, selected port, and finite duration alongside Pino's numeric level. Arbitrary fields and nested objects are dropped before serialization, with additional credential-key redaction configured. Request/response objects, bodies, tool arguments/results, workout contents, credentials, tokens, and database URLs must remain outside this logging boundary. Debug/trace levels do not enable payload logging.

For captured diagnostics, pass a destination stream to `createLogger(level, destination)` and inject that logger into `createApplication({ logger })` or `startServer(configuration, { logger })`. Await `application.close()` or `server.close()` so pending output flushes; the listener also flushes after its shutdown event. An injected destination remains caller-owned and is not closed by the logger. [Diagnostic tests](tests/server/diagnostics.test.ts) cover exact events and fields, level filtering, correlation under concurrency, privacy, and delayed output; [registrar tests](tests/server/tool-registrar.test.ts) cover automatic handler protection and SDK contracts.

## Prisma and database configuration

Prisma CLI, client, and PostgreSQL adapter are pinned to **7.10.1**; `pg` and its types are pinned to **8.23.1**. Root `prisma.config.ts` selects `prisma/schema.prisma` and `prisma/migrations`. After `npm ci`, these commands need no database or `DATABASE_URL`:

```sh
npm run prisma:format
npm run prisma:validate
npm run prisma:generate
```

Generation writes the `prisma-client` output to ignored `src/generated/prisma/`. Application typechecking and builds regenerate it automatically; on a clean checkout, generate before standalone `npm run typecheck:test`, and build before standalone `npm test`. Generated sources and build output are not committed. Formatting and structural validation do not approve the schema's business rules or apply it to PostgreSQL; see [remaining data-model invariants](docs/data-model.md).

Database operations require an explicitly supplied `DATABASE_URL` with PostgreSQL protocol, user, host, port, and database. Include a URL-encoded password when authentication requires it. Runtime entry points, Prisma CLI commands, and migration/lifecycle scripts load the optional project-root `.env` using Node 24's built-in loader. Exported variables take precedence, including an exported empty value; a missing file is harmless, while other loading errors produce a sanitized message.

For local configuration, copy the committed template without overwriting an existing file:

```sh
cp -n .env.example .env
```

Edit `.env` and replace every placeholder with the deliberately selected existing role, host, port, and database before running commands. The local launcher uses `127.0.0.1:55432`; this non-secret example illustrates that endpoint, with example names to replace:

```dotenv
DATABASE_URL=postgresql://example_role@127.0.0.1:55432/example_database
```

The launcher also places its Unix socket in the project's `.local/run` directory. To select that transport, use `localhost` in the URL authority and one `host` query containing the URL-encoded absolute socket directory, while retaining the explicit user, port, and database:

```dotenv
DATABASE_URL=postgresql://example_role@localhost:55432/example_database?host=%2Fpath%2Fto%2Fworkout-mcp%2F.local%2Frun
```

Replace the illustrative directory with your checkout's absolute `.local/run` path, then encode it with `encodeURIComponent`; `/` becomes `%2F`. Duplicate socket hosts, relative directories, and conflicting destination query parameters are rejected. PostgreSQL uses separate authentication rules for Unix sockets and TCP: a working local socket connection does not establish TCP password authentication. The verified local lifecycle uses the existing socket authentication configuration without changing it.

Keep `.env` private and ignored by Git; commit only the placeholder `.env.example`. A configured malformed URL, including the unedited template, is rejected even by Prisma's database-free commands. Leave `DATABASE_URL` unset and omit `.env` when only generating or checking code. To override a local value, export `DATABASE_URL` in the invoking shell. After selecting a reachable database and completing configuration, from Node 24 or the declared Nix shell run:

```sh
npm run database:check
```

The check connects, runs `SELECT 1`, and disconnects; it does not create tables, migrate, or start PostgreSQL. Success prints `Database connection succeeded.` Missing/malformed configuration is rejected before driver fallback; connection failures produce a sanitized message. Verify the selected database and transport are already reachable if the check fails. Independent read-only socket verification confirmed the database backend was released after disconnection.

For application integration, import `createDatabase` from `src/database/index.ts`, construct it once with explicit configuration, and share its `client` rather than constructing a pool per request. Import and construction do not connect. Await `connect()` explicitly and await `disconnect()` during shutdown or in a `finally` block; shutdown disconnects Prisma and ends the pool. The local MCP entry point does not invoke this boundary.

## Migration workflow

The domain schema is a review draft. No initial migration has been created or applied, and its remaining constraints must be reviewed before application. The following commands are available for later authorized migration work; do not use them to apply the current draft to a normal developer database.

| Command | Purpose |
| --- | --- |
| `npm run migrate:status` | Inspect migration status for the explicitly configured database. |
| `npm run migrate:create -- --name NAME` | Use development migration tooling with `--create-only`, then review generated SQL under `prisma/migrations`. |
| `npm run migrate:dev` | Create/apply development migrations after review in an appropriate development environment. |
| `npm run migrate:deploy` | Apply already committed migrations in a deployment environment. |

All migration commands validate `DATABASE_URL` before invoking Prisma. Development migration commands use Prisma's shadow-database workflow and can require database creation privileges; `--create-only` is not a general read-only database check. Select the target and required permissions deliberately. No migration command is part of `npm run check`, and no reset or seed workflow is provided here.

## PostgreSQL integration tests

Use Node 24 and an already-running PostgreSQL 18 server. The selected role must be able to create/drop its test databases and terminate remaining connections to them. The runner does not start or reset the local cluster. With the existing development environment running, enter `nix develop` for Node and PostgreSQL tools.

Set a separate `TEST_DATABASE_ADMIN_URL` in ignored `.env` or the invoking environment. Select an existing administrative database outside the `workout_mcp_test_` namespace; the runner never derives this setting from the application's `DATABASE_URL`. For the local socket, replace the illustrative role, database, and encoded absolute directory:

```dotenv
TEST_DATABASE_ADMIN_URL=postgresql://example_role@localhost:55432/example_admin_database?host=%2Fpath%2Fto%2Fworkout-mcp%2F.local%2Frun
```

Run:

```sh
npm run test:integration
```

Each invocation creates its own `workout_mcp_test_<32 hexadecimal characters>` database and ownership marker, applies checked-in migrations with `migrate deploy`, and runs `tests/integration/*.integration.ts` through the Node test runner. Add database-backed scenarios there; ordinary `*.test.ts` tests remain part of the database-free `npm run check`.

There are currently no checked-in migrations. The runner reports that explicitly; the existing integration scenario proves fresh-database isolation and transaction rollback, not domain-schema behavior. Concurrent invocations use different databases. Application clients close before cleanup; the runner reaps subprocesses and drops only its generated, owned database on success, failure, `INT`, or `TERM`.

If cleanup fails, the command exits nonzero and reports the generated database name. Give that exact name and run context to a maintainer for targeted inspection; do not reset the development database or delete every database matching a prefix. `SIGKILL`, machine shutdown, and loss of administrative access can prevent cleanup. For an initial configuration failure, check the explicit admin URL, PostgreSQL major version, and role privileges before retrying.

### Test database artifacts

Artifacts are optional. Select a mode in the invoking environment:

| Mode | Result |
| --- | --- |
| `TEST_DB_ARTIFACT=off` (default) | No dump. |
| `TEST_DB_ARTIFACT=on-failure` | Dump only when the test/migration run fails or is interrupted. |
| `TEST_DB_ARTIFACT=always` | Dump on every run. |

```sh
TEST_DB_ARTIFACT=on-failure npm run test:integration
```

Artifact modes require PostgreSQL 18 `pg_dump` and `pg_restore` on `PATH`; the Nix environment supplies them. Before database cleanup, the runner dumps only its generated test database in custom format and validates it with `pg_restore --list`. Validated dumps stay under ignored `.local/test-artifacts/`, with directory mode `0700` and file mode `0600`. Existing artifact paths and symlinks are rejected. Dump or validation errors are reported, make the run fail, and still invoke database cleanup.

Custom archives can retain owner role metadata. Any later `pg_restore` operation must use `--no-owner --no-acl`; `pg_dump --no-owner` alone does not suppress ownership restoration for custom format. These test artifacts are not a production backup/restore workflow. Keep fixtures synthetic and free of credentials or development/production data; artifact names and runner output do not contain connection URLs or passwords.

The dedicated PostgreSQL 18 CI job runs the same integration command with artifact mode `off`. Dump uploads are disabled for this public repository; restricted CI uploads are deferred. Local artifact modes remain available.


## Agent setup

This project selects reusable agents and skills from the separate `agent_workflows` checkout. Preview and install the project-local copies:

```sh
bash scripts/setup_agents.sh --dry-run
bash scripts/setup_agents.sh
```

If that checkout is not at `../../agent_workflows`, pass `--workflow-repo DIRECTORY` or set `AGENT_WORKFLOWS_DIR`. See [AGENTS.md](AGENTS.md) for the selected agent, roadmap sources, planning boundaries, and tracker setup requirements. Installation does not start planning or create tickets.
