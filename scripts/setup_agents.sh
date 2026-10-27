#!/usr/bin/env bash
# Install this project's selected agents and shared skills locally.
set -euo pipefail
project_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
workflow_repo="${AGENT_WORKFLOWS_DIR:-$project_root/../../agent_workflows}"
options=()
while (( $# )); do
    case "$1" in
        --workflow-repo)
            if (( $# < 2 )) || [[ -z "$2" || "$2" == --* ]]; then
                echo '--workflow-repo requires the agent_workflows checkout directory' >&2
                exit 2
            fi
            workflow_repo="$2"; shift 2 ;;
        --dry-run|--force) options+=("$1"); shift ;;
        --help|-h)
            echo 'Usage: bash scripts/setup_agents.sh [--workflow-repo DIRECTORY] [--dry-run] [--force]'
            exit 0 ;;
        *) echo "Unknown argument: $1" >&2; exit 2 ;;
    esac
done
if [[ ! -f "$workflow_repo/scripts/install.sh" ]]; then
    echo "Agent Workflows installer not found at $workflow_repo/scripts/install.sh" >&2
    echo 'Supply --workflow-repo DIRECTORY or set AGENT_WORKFLOWS_DIR to its checkout.' >&2
    exit 2
fi
exec bash "$workflow_repo/scripts/install.sh" \
    --agent roadmap_design \
    --prefix workout \
    --skill workflow-youtrack \
    --agents-target "$project_root/.codex/agents" \
    --target "$project_root/.agents/skills" \
    ${options[@]+"${options[@]}"}
