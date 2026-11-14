#!/usr/bin/env node
// seed.mjs — sample rows in this checkout's database, to try things out
// locally: `pnpm database:seed`, which starts and migrates the database
// first (source/database/local/server.ts). Seeding again replaces them.
//
// The seed is TypeScript in source/database/seed/ that imports through the
// app's `@/` paths, which Node can't follow on its own the way it runs
// migrate.ts. Vite's module runner loads it instead, with the paths from
// tsconfig.json.
import { runnerImport } from "vite"

const { module } = await runnerImport("/source/database/seed/seed.ts", {
    configFile: false,
    resolve: { tsconfigPaths: true },
    logLevel: "error"
})
await module.seedLocalDatabase()
