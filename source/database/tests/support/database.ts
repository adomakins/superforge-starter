import { randomUUID } from "node:crypto"
import { inject, onTestFinished } from "vitest"
import { connect } from "../.."
import { databaseUrl, onServer, quoted } from "./server"

/**
 * A database of the test's own, with every migration applied: a copy of
 * the run's template (setup.ts), dropped when the test finishes. For
 * testing code that queries the database on real rows, as a route sees it
 * through `context.var.database`. Call it inside a test.
 */
export async function testDatabase() {
    const template = inject("database_template")
    const name = `app_test_${randomUUID().replaceAll("-", "")}`
    await onServer((client) =>
        client.query(
            `create database ${quoted(name)} template ${quoted(template)}`
        )
    )

    // Two connections are plenty for one test, and keep a run's tests in
    // parallel under the server's limit
    const database = connect(databaseUrl(name), 2)
    onTestFinished(async () => {
        await database.$client.end()
        await onServer((client) =>
            client.query(`drop database ${quoted(name)} with (force)`)
        )
    })
    return database
}
