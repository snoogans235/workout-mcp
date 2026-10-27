#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_root"

# Enter Nix before using its PostgreSQL tools.
if [[ "${1:-}" != "--inside" ]]; then
  exec nix develop --command bash "$project_root/scripts/dev.sh" --inside
fi

export PGDATA="$project_root/.local/postgres"
export PGHOST="$project_root/.local/run"
export PGPORT=55432

if [[ ! -f "$PGDATA/PG_VERSION" ]]; then
  echo "Initialize the PostgreSQL cluster before running this launcher." >&2
  exit 1
fi

if pg_ctl -D "$PGDATA" status >/dev/null 2>&1; then
  echo "PostgreSQL is already running. Stop it before using this launcher." >&2
  exit 1
fi

mkdir -p "$PGHOST"
chmod 700 "$PGHOST"

pg_ctl \
  -D "$PGDATA" \
  -l "$project_root/.local/postgres.log" \
  -o "-h 127.0.0.1 -p $PGPORT -k $PGHOST" \
  -w start

cleanup() {
  echo "Stopping project PostgreSQL..."
  pg_ctl -D "$PGDATA" -m fast -w stop
}

trap cleanup EXIT

echo "Development environment ready. Type exit to stop PostgreSQL."
export PS1='(workout-mcp) \w \$ '

# Keep Nix's environment without loading profiles that could switch Node versions.
bash --noprofile --norc -i