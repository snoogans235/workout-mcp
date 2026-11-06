# Workout MCP architecture

Status: agreed direction and proposed domain interfaces. A local Express-hosted `/mcp` endpoint and read-only `server_status` tool are implemented; identity persistence is available behind a database boundary, with bearer authentication and persisted user resolution; workout domain services and remote connectivity remain planned. See [local server operation and composition](../README.md#local-mcp-server).

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

## OAuth contract

[WOR-14](https://gnym.youtrack.cloud/issue/WOR-14) selects Auth0 as the managed authorization server, ChatGPT as the OAuth client, and Workout MCP as the protected resource server. The HTTP MCP endpoint validates access tokens and resolves application users. [`.env.example`](../.env.example) declares the OAuth variable names; fill their values for your environment in `.env`. Production startup requires the issuer/audience and database configuration; it performs no migrations.

### Resource and discovery

| Setting | Development contract |
| --- | --- |
| `OAUTH_ISSUER` | `https://dev-0j67a1ed8v12sp5t.us.auth0.com/` |
| `OAUTH_AUDIENCE` and canonical resource URI | `https://workout-mcp.dev.gnym.ai` |
| Authorization-server discovery | `https://dev-0j67a1ed8v12sp5t.us.auth0.com/.well-known/openid-configuration` |
| Signing keys | Use discovery's `jwks_uri`, currently `https://dev-0j67a1ed8v12sp5t.us.auth0.com/.well-known/jwks.json` |
| Application scopes | `workout:read`, `workout:write` |

Compare issuer and audience exactly, including the issuer's trailing slash and the audience's absence of one. Use the canonical resource URI consistently in protected-resource metadata, OAuth `resource` requests, the Auth0 API identifier, and access-token audience validation. The resource identifies this development API; the `/mcp` transport path and a later tunnel connection do not change it. This identifier does not require hosted content or DNS during configuration. Production must have separate issuer/audience configuration and must not accept development tokens. See [MCP authorization](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization) and [Auth0 API settings](https://auth0.com/docs/get-started/apis/api-settings).

Workout MCP exposes public OAuth Protected Resource Metadata naming the resource and authorization server, and advertises its location in authentication challenges. Its `scopes_supported` lists exactly `workout:read` and `workout:write`, shared with runtime enforcement. Every tool declares one required scope through `ToolRegistrar`; `server_status` requires read. Insufficient scope returns HTTP 403 before dispatch, with the required scope and resource metadata in the challenge. Write does not imply read; unrelated scopes grant no application capability. See [scope operation and extension guidance](../README.md#authenticated-identity-and-handler-context). The tenant's public discovery advertises authorization code and refresh grants, PKCE `S256`, public subjects, signing keys, and issuer identification in authorization responses. Jonathan confirmed that Resource Parameter Compatibility Profile and Include Issuer in Authorization Responses are enabled. The selected client must use authorization code with PKCE `S256`; the presence of other grants in tenant discovery does not authorize their use by this integration. [Auth0 resource compatibility settings](https://auth0.com/ai/docs/mcp/guides/resource-param-compatibility-profile)

### Client registration and token lifecycle

Use a manually pre-registered Auth0 **Regular Web Application** representing ChatGPT, with authorization code and refresh-token grants, PKCE `S256`, and token-endpoint authentication `client_secret_basic` (**Client Secret (Basic)**). At connection setup in WOR-19, copy the exact callback URI from that ChatGPT connection's management page into the client's callback allowlist and supply its client ID and secret through ChatGPT's registered-client configuration. Do not invent a callback URI or add login/callback routes to the MCP application. [ChatGPT registered OAuth clients](https://developers.openai.com/plugins/build/plugins#use-a-registered-oauth-client), [Auth0 client credentials](https://auth0.com/docs/get-started/applications/credentials)

The current discovery document does not advertise CIMD support or a dynamic registration endpoint. Neither is required by the chosen pre-registration flow; `private_key_jwt` is also not required. Final account eligibility, client configuration, and an authenticated ChatGPT invocation remain WOR-19 verification, rather than evidence of an existing connection. [ChatGPT authentication](https://developers.openai.com/plugins/build/auth)

The accepted planned application policy is:

- Signed RS256 JWT access tokens with a 3,600-second lifetime.
- API **Allow Offline Access** enabled; the client requests `offline_access` to obtain refresh tokens.
- Refresh-token rotation enabled, with a 2,592,000-second maximum family lifetime (30 days) and a 604,800-second idle lifetime (7 days). Expiry or revocation requires authorization again when refresh is no longer possible.

These are application policy choices, not Auth0 defaults. The actual tenant/API and client settings have not been confirmed; Jonathan must apply and verify this policy during WOR-19 connection setup before authenticated use. See [API token and offline-access settings](https://auth0.com/docs/get-started/apis/api-settings), [refresh-token rotation](https://auth0.com/docs/secure/tokens/refresh-tokens/refresh-token-rotation), and [refresh expiration](https://auth0.com/docs/secure/tokens/refresh-tokens/configure-refresh-token-expiration).

### Identity, permissions, and provider replacement

The implemented verifier uses provider discovery and JWKS to validate signature, allowed algorithm, exact issuer, expected audience, expiry, not-before when present, and a nonempty stable subject. ID tokens cannot authorize MCP requests. Signed JWTs are the selected Auth0 validation path, not an MCP requirement; switching to an opaque-token provider requires an explicitly reviewed standards-based introspection path.

Resolve verified `(iss, sub)` to an application-owned `User.id`. Email, profile names, and model-supplied owner IDs must never select that user. Tool handlers and domain services receive application identity and granted scopes through request context, without Auth0 SDK objects or vendor-specific claims. Keep verification behind a provider-independent boundary and issuer/audience in configuration. Replacing the provider requires an explicit identity migration or account-linking decision; matching emails do not establish identity equivalence. Scopes limit permitted operations, while record ownership independently constrains private reads, writes, and relationships.

Jonathan owns tenant/API configuration, client registration, callback allowlists, and secret administration. Auth0 manages signing keys; the OAuth client stores its registration credential and refresh tokens. The MCP verifier uses public signing keys and needs no OAuth client secret. Never record credentials, access/refresh tokens, or sensitive identity claims in Git, YouTrack, logs, or tool results.

WOR-15 owns persisted identities; WOR-16 owns metadata, token validation, and authenticated context; WOR-17 owns scope enforcement; WOR-18 owns record isolation; WOR-19 owns Secure MCP Tunnel setup and the authenticated ChatGPT connection proof. Identity persistence, token validation/context, and scope enforcement are implemented; record isolation and the remote connection proof remain planned.

## Implemented identity persistence

`src/identity/users.ts` resolves an already verified issuer/subject pair to an application user through the shared Prisma client. It performs atomic first-user creation with explicit initial profile data and preserves returning-user display names and timezones. HTTP authentication calls it only after token verification, supplying neutral initial profile defaults; returning display names and timezones are preserved. See [authenticated request composition](../README.md#authenticated-identity-and-handler-context) for defaults, context access, and failure behavior. See the [identity persistence contract](data-model.md#users-and-external-identities) and [explicit local bootstrap](../README.md#local-bootstrap-user). The bootstrap user remains unlinked; authentication never falls back to it.

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

Choose supported ChatGPT connectivity and verify account availability. Complete private-data authorization, write validation, retry protection, and deployment/backups. Shared catalog curation rights and private custom entries need decisions before multi-user use.

The existing HTTP endpoint binds only to `127.0.0.1`. OAuth protected-resource metadata is public and requires no database lookup; the protected `server_status` tool requires a verified access token and persisted user resolution. No remote connection exists yet.

## References

- [OpenAI MCP server guidance](https://developers.openai.com/plugins/build/mcp-server)
- [Official MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [Prisma 7 schema reference](https://www.prisma.io/docs/orm/v7/reference/prisma-schema-reference)

