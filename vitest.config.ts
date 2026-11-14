import { availableParallelism } from "node:os"
import { defineConfig } from "vitest/config"

// Tests run in Node, without vite.config.ts and its plugins. Code that
// queries the database runs against a real Postgres, a database of its own
// per test (source/database/tests/support/database.ts). CI splits the files
// across its `tests` jobs with `--shard` (workbench/scripts/check.sh). When
// a few files grow slow, a custom sequencer can balance the shards by how
// long each takes, rather than by vitest's hash of their paths.
export default defineConfig({
    resolve: { tsconfigPaths: true },
    test: {
        include: ["source/**/*.test.ts"],
        // The template database every test's is a copy of, with every
        // migration applied, made once a run
        globalSetup: ["source/database/tests/support/setup.ts"],
        // Vitest's own default, a worker fewer than the cores, leaves CI's
        // 2-core runner one, and two run the suite faster there
        maxWorkers: Math.max(availableParallelism() - 1, 2)
    }
})
