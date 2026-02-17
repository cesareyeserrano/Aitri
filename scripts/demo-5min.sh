#!/usr/bin/env bash
set -euo pipefail

START_TS="$(date +%s)"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKDIR="${1:-$(mktemp -d "${TMPDIR:-/tmp}/aitri-demo-XXXXXX")}"
FEATURE="${FEATURE:-demo-login}"

AITRI_CMD=(node "$ROOT_DIR/cli/index.js")
if [ "${AITRI_USE_GLOBAL:-0}" = "1" ] && command -v aitri >/dev/null 2>&1; then
  AITRI_CMD=(aitri)
fi

run() {
  printf "\n$"
  for arg in "$@"; do
    printf " %q" "$arg"
  done
  printf "\n"
  "$@"
}

mkdir -p "$WORKDIR"
cd "$WORKDIR"

if [ ! -d ".git" ]; then
  run git init -q
  run git config user.name "Aitri Demo"
  run git config user.email "demo@aitri.local"
fi

run "${AITRI_CMD[@]}" init --non-interactive --yes
run "${AITRI_CMD[@]}" resume json
run "${AITRI_CMD[@]}" draft --feature "$FEATURE" --idea "Email and password login with reset flow" --non-interactive --yes

DRAFT_FILE="specs/drafts/${FEATURE}.md"
if [ -f "$DRAFT_FILE" ]; then
  perl -0pi -e 's/- FR-1: <verifiable rule>\n- FR-2: <verifiable rule>/- FR-1: User can sign in with email and password.\n- FR-2: User can request password reset via verified email./g' "$DRAFT_FILE"
  perl -0pi -e 's/- <edge case>/- Repeated failed login attempts trigger temporary lockout./g' "$DRAFT_FILE"
  perl -0pi -e 's/- <at least one security note\/control>/- Enforce rate limiting on login and reset endpoints./g' "$DRAFT_FILE"
  perl -0pi -e 's/- AC-1: Given <context>, when <action>, then <expected>\.\n- AC-2: Given <context>, when <action>, then <expected>\./- AC-1: Given a registered user, when valid credentials are submitted, then login succeeds.\n- AC-2: Given an unknown user, when login is attempted, then access is denied.\n- AC-3: Given a registered user, when password reset is requested, then a reset token is sent./g' "$DRAFT_FILE"
fi

run "${AITRI_CMD[@]}" approve --feature "$FEATURE" --non-interactive --yes
run "${AITRI_CMD[@]}" discover --feature "$FEATURE" --non-interactive --yes
run "${AITRI_CMD[@]}" plan --feature "$FEATURE" --non-interactive --yes

BACKLOG_FILE="backlog/${FEATURE}/backlog.md"
TESTS_FILE="tests/${FEATURE}/tests.md"
if [ -f "$BACKLOG_FILE" ]; then
  perl -0pi -e 's/FR-\?/FR-1, FR-2/g; s/AC-\?/AC-1/g' "$BACKLOG_FILE"
fi
if [ -f "$TESTS_FILE" ]; then
  perl -0pi -e 's/US-\?/US-1, US-2/g; s/FR-\?/FR-1, FR-2/g; s/AC-\?/AC-1/g' "$TESTS_FILE"
fi

cat > package.json <<'JSON'
{
  "name": "aitri-demo",
  "private": true,
  "scripts": {
    "test:aitri": "node -e \"process.exit(0)\""
  }
}
JSON

run git add package.json
run git commit -m "checkpoint: ${FEATURE} dependency-manifest"

run "${AITRI_CMD[@]}" validate --feature "$FEATURE" --format json
run "${AITRI_CMD[@]}" verify --feature "$FEATURE" --format json
run "${AITRI_CMD[@]}" policy --feature "$FEATURE" --format json
run "${AITRI_CMD[@]}" handoff
run "${AITRI_CMD[@]}" resume --non-interactive --yes

END_TS="$(date +%s)"
ELAPSED="$((END_TS - START_TS))"

printf "\nDemo completed in %ss\n" "$ELAPSED"
printf "Workspace: %s\n" "$WORKDIR"

if [ "$ELAPSED" -gt 300 ]; then
  printf "Result: over 5 minutes (target missed)\n"
  exit 1
fi

printf "Result: within 5 minutes (target met)\n"
