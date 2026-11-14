#!/usr/bin/env bash
# upgrade-test.sh — the branch's migrations applied over another branch's,
# on a database with rows in it (`pnpm database:upgrade-test [ref]`, and
# CI's `tests` jobs on each PR): source/database/tests/upgrade.test.ts.
# The ref defaults to origin/main, which PRs target.
set -euo pipefail

cd "$(dirname "$0")/../.."

UPGRADE_FROM=${1:-origin/main} pnpm exec vitest run source/database/tests/upgrade.test.ts
