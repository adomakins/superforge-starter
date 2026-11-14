import type { TestProject } from "vitest/node"
import { startLocalServer } from "../../local/server"
import { migrateDatabase } from "../../migrate"
import { databaseUrl, onServer, quoted } from "./server"

// Vitest's global setup (vitest.config.ts): once a run, a template database
// with every migration applied from empty, which each test's database is a
// copy of (`testDatabase()`), migrated with the function the deploy runs
// (`pnpm database:migrate`). It's named for this run, so two runs at once in
// one checkout, on its one Postgres, don't meet.

declare module "vitest" {
    export interface ProvidedContext {
        database_template: string
    }
}

export default async function setup(project: TestProject) {
    // This checkout's Postgres, started if it isn't running, made the
    // first time
    await startLocalServer()

    const template = `app_test_template_${process.pid}`
    await onServer((client) =>
        client.query(`drop database if exists ${quoted(template)} with (force)`)
    )
    await onServer((client) =>
        client.query(`create database ${quoted(template)}`)
    )
    await migrateDatabase(databaseUrl(template))
    project.provide("database_template", template)

    return async () => {
        await onServer((client) =>
            client.query(
                `drop database if exists ${quoted(template)} with (force)`
            )
        )
    }
}
