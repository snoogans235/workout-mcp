#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
mode="${1:-}"
if [[ "$#" != 1 || ( "$mode" != generate && "$mode" != check ) ]]; then
    echo 'Usage: bash scripts/tool-reference.sh generate|check' >&2
    exit 2
fi

reference=docs/tool-reference.md
temporary="$(mktemp -d "${TMPDIR:-/tmp}/workout-tool-reference.XXXXXXXX")"
server_pid=
step_pid=
timer_pid=

# Every PID here belongs to this invocation. Never find/kill a listener by port.
tree_pids() {
    local process_id="$1" descendant
    printf '%s\n' "$process_id"
    for descendant in $(pgrep -P "$process_id" || true); do
        tree_pids "$descendant"
    done
}

stop_tree() {
    local owned_pids
    # Snapshot before TERM: children may be reparented when their parent exits.
    # Retain the entire owned tree for escalation, not just its root PID.
    owned_pids="$(tree_pids "$1")"
    kill -TERM $owned_pids 2>/dev/null || true
    sleep 1
    kill -KILL $owned_pids 2>/dev/null || true
}

cleanup() {
    local status=$?
    trap - EXIT INT TERM
    for process_id in "$timer_pid" "$step_pid" "$server_pid"; do
        if [[ -n "$process_id" ]]; then
            stop_tree "$process_id"
        fi
    done
    wait 2>/dev/null || true
    rm -rf "$temporary"
    exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

run_step() {
    local status=0
    "$@" <&0 &
    step_pid=$!
    (
        sleep 120
        echo 'Tool reference command timed out.' >&2
        # Let the owner snapshot and stop the step's whole tree before any
        # parent exits and reparents its children.
        kill -TERM "$$"
    ) &
    timer_pid=$!
    wait "$step_pid" || status=$?
    stop_tree "$timer_pid"
    wait "$timer_pid" 2>/dev/null || true
    timer_pid=
    step_pid=
    return "$status"
}

run_step npm run build
MCP_HOST=127.0.0.1 MCP_PORT="${TOOL_REFERENCE_PORT:-0}" LOG_LEVEL=info \
    node dist/index.js >"$temporary/server.log" 2>&1 &
server_pid=$!

port=
for ((attempt = 0; attempt < 100; attempt++)); do
    if ! kill -0 "$server_pid" 2>/dev/null; then
        echo 'Tool reference server failed to start.' >&2
        exit 1
    fi
    port="$(node --input-type=module - "$temporary/server.log" <<'NODE'
import { readFileSync } from 'node:fs';
for (const line of readFileSync(process.argv[2], 'utf8').split('\n')) {
    try {
        const event = JSON.parse(line);
        if (event.event === 'startup' && Number.isInteger(event.port) && event.port > 0) {
            console.log(event.port);
            break;
        }
    } catch { /* The next poll reads any incomplete log record. */ }
}
NODE
)"
    if [[ -n "$port" ]]; then
        break
    fi
    sleep 0.1
done
if [[ -z "$port" ]]; then
    echo 'Tool reference server readiness timed out.' >&2
    exit 1
fi

cli=node_modules/.bin/mcpcontract
run_step "$cli" dump --transport streamable-http --url "http://127.0.0.1:$port/mcp" \
    --protocol 2026-07-28 --skip-cors-check --quiet --output "$temporary/raw.json"
run_step "$cli" validate "$temporary/raw.json" --strict

# Normalize only extraction metadata and unordered capability lists/object keys.
# Schema arrays retain their order; authored descriptions and schemas stay intact.
run_step node --input-type=module - "$temporary/raw.json" "$temporary/stable.json" <<'NODE'
import { readFileSync, writeFileSync } from 'node:fs';
const description = JSON.parse(readFileSync(process.argv[2], 'utf8'));
for (const transport of description.transports ?? []) {
    if (transport.type === 'streamable-http') {
        transport.url = 'http://127.0.0.1/mcp';
    }
}
for (const key of ['tools', 'prompts', 'resources', 'resourceTemplates']) {
    if (Array.isArray(description[key])) {
        description[key].sort((left, right) => {
            const a = left.name ?? left.uri ?? left.uriTemplate ?? '';
            const b = right.name ?? right.uri ?? right.uriTemplate ?? '';
            return a < b ? -1 : a > b ? 1 : 0;
        });
    }
}
function sorted(value) {
    if (Array.isArray(value)) {
        return value.map(sorted);
    }
    if (value !== null && typeof value === 'object') {
        return Object.fromEntries(Object.keys(value).sort().map(key => [key, sorted(value[key])]));
    }
    return value;
}
writeFileSync(process.argv[3], JSON.stringify(sorted(description), null, 2) + '\n');
NODE
run_step "$cli" validate "$temporary/stable.json" --strict
run_step "$cli" document "$temporary/stable.json" --template reference-documentation \
    --protocol-version 2026-07-28 --quiet --output "$temporary/reference.md"

# The upstream reference template omits output schemas and annotations. Include
# their extracted values, plus input schemas, so all contract changes cause drift.
run_step node --input-type=module - "$temporary/stable.json" "$temporary/reference.md" <<'NODE'
import { appendFileSync, readFileSync } from 'node:fs';
const description = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const contracts = (description.tools ?? []).map(tool => ({
    name: tool.name,
    inputSchema: tool.inputSchema,
    ...(tool.outputSchema === undefined ? {} : { outputSchema: tool.outputSchema }),
    ...(tool.annotations === undefined ? {} : { annotations: tool.annotations }),
}));
appendFileSync(process.argv[3], '\n## Published tool schemas and annotations\n\n```json\n'
    + JSON.stringify(contracts, null, 2) + '\n```\n');
NODE

if [[ "$mode" == generate ]]; then
    cp "$temporary/reference.md" "$reference"
    echo "Generated $reference"
elif [[ ! -f "$reference" ]] || ! cmp -s "$reference" "$temporary/reference.md"; then
    echo "Tool reference is missing or stale. Run npm run docs:tools:generate." >&2
    if [[ -f "$reference" ]]; then
        diff -u "$reference" "$temporary/reference.md" || true
    fi
    exit 1
else
    echo 'Tool reference is current.'
fi
