import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import pg from "pg"
import { describe, expect, test } from "vitest"
import {
    migrateDatabase,
    migrationsJournal,
    recordedMigrations
} from "../migrate"
import { fill, SCHEMAS } from "./support/fill"
import { databaseUrl, onServer, quoted } from "./support/server"

// The PR's migrations applied over the base branch's, on a database with
// rows in it, as a deploy applies them over production's: CI's `tests`
// jobs set UPGRADE_FROM to the base branch (.github/workflows/ci.yml), and
// `pnpm database:upgrade-test [ref]` runs it here. A new NOT NULL column or
// unique index that existing rows break fails the PR, not the deploy.
//
// It also checks that the database ends up with exactly the PR's
// migrations, as the deploy would record them. Drizzle applies only those
// timed after the newest one already applied, so one generated before
// another merged would never run, and a shipped one edited since would
// never run again.

const base = process.env.UPGRADE_FROM
const FOLDER = "source/database/migrations"

// Two branches' migrations from empty, with rows between: a few seconds,
// so it gets more than vitest's 5, which a busy machine can go past
describe.runIf(base !== undefined)(
    `upgrading from ${base}`,
    {
        timeout: 30_000
    },
    () => {
        test("the PR's migrations apply over the base's, on rows, and are all recorded", async () => {
            const ref = base ?? ""
            const name = `app_upgrade_${process.pid}`
            await onServer((client) =>
                client.query(
                    `drop database if exists ${quoted(name)} with (force)`
                )
            )
            await onServer((client) =>
                client.query(`create database ${quoted(name)}`)
            )
            const url = databaseUrl(name)

            try {
                // The base's migrations, if it has any yet, then sample rows
                // in every one of its tables, however many it has (none, when
                // its migrations only make schemas)
                const before = migrationsAt(ref)
                if (before !== undefined) {
                    await migrateDatabase(url, before)
                }
                const filled = await withClient(url, (client) => fill(client))
                const tables = await withClient(url, (client) =>
                    tableCount(client)
                )
                expect(Object.keys(filled).length).toBe(tables)

                // Then the PR's, as the deploy applies them
                await migrateDatabase(url)

                const recorded = await withClient(url, (client) =>
                    recordedMigrations(client)
                )
                expect(recorded).toEqual(migrationsJournal())
            } finally {
                await onServer((client) =>
                    client.query(
                        `drop database if exists ${quoted(name)} with (force)`
                    )
                )
            }
        })
    }
)

// The migrations folder as `ref` has it, copied out of git, or undefined
// when it has none
function migrationsAt(ref: string) {
    const files = execFileSync(
        "git",
        ["ls-tree", "-r", "--name-only", ref, "--", FOLDER],
        { encoding: "utf8" }
    )
        .split("\n")
        .filter((file) => file !== "")
    if (files.length === 0) {
        return undefined
    }

    const copy = mkdtempSync(join(tmpdir(), "app-upgrade-"))
    for (const file of files) {
        const path = join(copy, file.slice(FOLDER.length + 1))
        mkdirSync(dirname(path), { recursive: true })
        writeFileSync(path, execFileSync("git", ["show", `${ref}:${file}`]))
    }
    return copy
}

// How many tables the database has in the schemas `fill()` fills
async function tableCount(client: pg.Client) {
    const { rows } = await client.query<{ tables: number }>(
        `
        select count(*)::int as tables
        from pg_class tables
        join pg_namespace schemas on schemas.oid = tables.relnamespace
        where schemas.nspname = any($1) and tables.relkind in ('r', 'p')
    `,
        [SCHEMAS]
    )
    const [counted] = rows
    if (counted === undefined) {
        throw new Error("Counting the tables answered no row")
    } else {
        return counted.tables
    }
}

async function withClient<Result>(
    url: string,
    work: (client: pg.Client) => Promise<Result>
) {
    const client = new pg.Client({ connectionString: url })
    await client.connect()
    try {
        return await work(client)
    } finally {
        await client.end()
    }
}
