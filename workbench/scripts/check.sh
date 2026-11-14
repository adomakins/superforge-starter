#!/usr/bin/env bash
# check.sh — everything CI checks, as `pnpm check`: two parts, which CI's
# jobs run side by side (.github/workflows/ci.yml), and so does this, so a
# branch that passes here passes there.
#
#   code       biome, read-only (formatting, lint and imports); the
#              migrations: the journal's order, and squawk
#              (check-migrations.sh); the typecheck; and the production
#              build, with its prerender
#   tests      the tests, on this checkout's Postgres (source/database/local/),
#              the upgrade test among them: the branch's migrations over the
#              base branch's, with rows in between
#              (source/database/tests/upgrade.test.ts)
#
# `check.sh <part>` runs one part, as each of CI's jobs does, and
# `check.sh tests 1/2` one shard of the tests. With no part named, it runs
# them both at once, each into a log of its own, prints each part's log
# whole once it's done, then which passed and how long each took.
#
# The upgrade test upgrades from origin/main, or UPGRADE_FROM (CI's is the
# PR's base). It's fetched first, so it's what GitHub has now; offline, it's
# what was fetched last.
set -euo pipefail

cd "$(dirname "$0")/../.."
script="$(pwd)/workbench/scripts/check.sh"

part=${1:-all}
argument=${2:-}
upgrade_from=${UPGRADE_FROM:-origin/main}

case $part in
all | code | tests) ;;
*)
    echo "Usage: check.sh [code | tests [shard]], like check.sh tests 1/2" >&2
    exit 2
    ;;
esac

step() {
    printf '\n▸ %s\n' "$1"
}

# Fetches a branch on origin (`origin/main`) or a commit, unless the
# `pnpm check` that started this part already has. A shallow clone, like
# CI's, fetches just that commit. A whole one fetches it all, since --depth
# would make it shallow.
fetch() {
    if [ -n "${CHECK_FETCHED:-}" ]; then
        return
    fi
    local depth=""
    if [ "$(git rev-parse --is-shallow-repository)" = true ]; then
        depth="--depth=1"
    fi
    # shellcheck disable=SC2086
    if ! git fetch --quiet --no-tags $depth origin "${1#origin/}"; then
        echo "Couldn't fetch $1, so this goes by what was fetched last" >&2
    fi
}

code() {
    step "Biome"
    pnpm exec biome ci .

    step "Migrations"
    workbench/scripts/check-migrations.sh

    step "Typecheck"
    pnpm exec tsc --noEmit

    step "Build"
    pnpm exec vite build
}

tests() {
    local shard=$1
    fetch "$upgrade_from"
    step "Tests${shard:+ (shard $shard)}, the upgrade test over $upgrade_from"
    # A shard can be left with no test files once there are fewer files than
    # shards, which isn't a failure
    # shellcheck disable=SC2086
    UPGRADE_FROM=$upgrade_from pnpm exec vitest run \
        ${shard:+--shard="$shard" --passWithNoTests}
}

if [ "$part" != all ]; then
    case $part in
    code) code ;;
    tests) tests "$argument" ;;
    esac
    exit 0
fi

# Both parts at once, each this script again with the part named. The tests
# start this checkout's Postgres, so it's started here, once, and the base is
# fetched here once.
node --disable-warning=ExperimentalWarning source/database/local/server.ts start >/dev/null
fetch "$upgrade_from"
export CHECK_FETCHED=1

logs=$(mktemp -d "${TMPDIR:-/tmp}/check.XXXXXX")
names=()
pids=()

# Parts started in the background ignore Ctrl-C, so stopping this stops
# them, and whatever they started, too
trap 'trap - INT TERM; kill 0' INT TERM

# Starts a part: its name, then the arguments it takes
launch() {
    local name=$1
    shift
    (
        started=$SECONDS
        status=0
        "$script" "$@" >"$logs/$name.log" 2>&1 || status=$?
        echo "$status $((SECONDS - started))" >"$logs/$name.result"
    ) &
    pids+=($!)
    names+=("$name")
}

# In about the order they finish, which is the order they're printed in
launch tests tests
launch code code

failed=0
results=()
for index in "${!names[@]}"; do
    name=${names[$index]}
    wait "${pids[$index]}"
    read -r status seconds <"$logs/$name.result"
    printf '\n━━ %s ━━\n' "$name"
    cat "$logs/$name.log"
    if [ "$status" = 0 ]; then
        results+=("✓ $name, ${seconds} s")
    else
        results+=("✗ $name, ${seconds} s: $logs/$name.log")
        failed=1
    fi
done

printf '\n━━ pnpm check ━━\n'
printf '%s\n' "${results[@]}"
if [ "$failed" = 0 ]; then
    rm -rf "$logs"
fi
exit "$failed"
