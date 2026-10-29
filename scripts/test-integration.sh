#!/usr/bin/env bash
set -euo pipefail
umask 077
project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_root"
export TEST_DB_ARTIFACT="${TEST_DB_ARTIFACT:-off}"

case "${TEST_DB_ARTIFACT:-off}" in off|on-failure|always) ;; *) echo 'TEST_DB_ARTIFACT must be off, on-failure, or always.' >&2; exit 1 ;; esac
if [[ "${TEST_DB_ARTIFACT:-off}" != off ]]; then
  command -v pg_dump >/dev/null && command -v pg_restore >/dev/null || { echo 'Artifact mode requires pg_dump and pg_restore.' >&2; exit 1; }
fi
database_name="workout_mcp_test_$(node --input-type=module -e 'import {randomUUID} from "node:crypto"; console.log(randomUUID().replaceAll("-", ""))')"
export TEST_DB_RUN_OWNER="$(node --input-type=module -e 'import {randomUUID} from "node:crypto"; console.log(randomUUID().replaceAll("-", ""))')"
[[ "$database_name" =~ ^workout_mcp_test_[a-f0-9]{32}$ ]] || exit 1
helper() { node --import tsx scripts/integration-database.ts "$@"; }
helper preflight
child_pid=''
created=0
cleanup() {
  result=$?
  trap - EXIT INT TERM
  if [[ -n "$child_pid" ]]; then kill -TERM "$child_pid" 2>/dev/null || true; wait "$child_pid" 2>/dev/null || true; fi
  if [[ "$created" == 1 ]]; then
    if ! helper artifact "$database_name" "$result"; then echo 'Artifact failed; cleanup will still run.' >&2; [[ "$result" != 0 ]] || result=1; fi
    if ! helper drop "$database_name"; then echo "Cleanup failed for $database_name; manual test-database cleanup is required." >&2; result=1; fi
  fi
  exit "$result"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
# Install cleanup before creation so even interrupted create attempts are contained.
created=1
node --import tsx scripts/integration-database.ts create "$database_name" & child_pid=$!
wait "$child_pid"
child_pid=''
node --import tsx scripts/integration-database.ts run "$database_name" & child_pid=$!
wait "$child_pid"
child_pid=''
