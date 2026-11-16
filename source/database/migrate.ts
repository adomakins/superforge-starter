import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { DBOS } from "@dbos-inc/dbos-sdk"
import { drizzle } from "drizzle-orm/node-postgres"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import pg from "pg"
import { z } from "zod"

/**
 * Applies the migrations the database at `DATABASE_URL` hasn't had yet:
 * `pnpm database:migrate`, which Railway runs before each deploy
 * (`preDeploy` in .railway/railway.ts), while the previous version still
 * serves. Drizzle applies every pending migration in one transaction, so
 * one that fails rolls them all back, this exits non-zero, and Railway
 * stops the deploy with the current version still serving.
 *
 * Then DBOS's own tables, in the `dbos` schema, with DBOS's own migrations
 * (`DBOS.migrate`), which DBOS would otherwise run only as it launches
 * (backend/workflows/engine.ts). Run here, they're there before any process
 * starts, so a process still waiting to launch can put a workflow on its
 * queue, and a DBOS upgrade's migrations run before the deploy, while the
 * version before still serves, like ours.
 *
 * Node runs this file from source, stripping its types, so it imports
 * only packages: no `@/` paths.
 */

/** The migrations drizzle-kit writes (drizzle.config.ts). */
export const MIGRATIONS_FOLDER = fileURLToPath(
    new URL("./migrations", import.meta.url)
)

/**
 * How long a migration waits for a lock before failing, and how long one
 * statement may run. A migration queued behind a busy table holds up every
 * query queued behind it in turn, so it fails and rolls back instead. The
 * statement limit sits under Railway's pre-deploy timeout
 * (`preDeployTimeoutSeconds`), so a slow migration rolls back cleanly here
 * rather than being killed part way.
 */
export const LOCK_TIMEOUT_SECONDS = 10
export const STATEMENT_TIMEOUT_SECONDS = 240
export const MIGRATION_SETTINGS = `-c lock_timeout=${LOCK_TIMEOUT_SECONDS}s -c statement_timeout=${STATEMENT_TIMEOUT_SECONDS}s`

/**
 * Applies what's pending to the database at `url`, ours then DBOS's, and
 * says how many of ours.
 */
export async function migrateDatabase(url: string, folder = MIGRATIONS_FOLDER) {
    const client = new pg.Client({
        connectionString: url,
        options: MIGRATION_SETTINGS
    })
    await client.connect()
    const migrated = await (async () => {
        try {
            const before = (await recordedMigrations(client)).length
            await migrate(drizzle(client), {
                migrationsFolder: folder
            })
            const after = (await recordedMigrations(client)).length
            return { applied: after - before, total: after }
        } finally {
            await client.end()
        }
    })()
    // The schema backend/workflows/engine.ts names
    await DBOS.migrate(url, { schemaName: "dbos" })
    return migrated
}

/**
 * A migration as Drizzle records it once applied, in
 * `drizzle.__drizzle_migrations`: the hash of its SQL, and its time in the
 * journal.
 */
export const migration = z.object({ hash: z.string(), when: z.number() })
export type Migration = z.infer<typeof migration>

// Whether Drizzle's table is there yet, and its rows. `created_at` is a
// bigint, which pg hands over as text.
const regclass_row = z.object({ table: z.string().nullable() })
const recorded_row = z.object({
    hash: z.string(),
    created_at: z.coerce.number()
})

// What drizzle-kit writes in meta/_journal.json, as far as this reads it
const journal_file = z.looseObject({
    entries: z.array(z.looseObject({ tag: z.string(), when: z.number() }))
})

function readJournal(folder: string) {
    return journal_file.parse(
        JSON.parse(readFileSync(join(folder, "meta/_journal.json"), "utf8"))
    )
}

/**
 * Each migration in a folder's journal, oldest first, as Drizzle records it
 * once applied.
 */
export function migrationsJournal(folder = MIGRATIONS_FOLDER): Migration[] {
    return readJournal(folder).entries.map((entry) => ({
        hash: createHash("sha256")
            .update(readFileSync(join(folder, `${entry.tag}.sql`), "utf8"))
            .digest("hex"),
        when: entry.when
    }))
}

/**
 * The migrations a database has recorded, oldest first, in Drizzle's own
 * table, which it makes the first time it migrates. Two queries, since
 * Postgres refuses one that names a table that isn't there, even in a
 * branch that wouldn't run.
 */
export async function recordedMigrations(
    client: pg.ClientBase
): Promise<Migration[]> {
    const { rows: found } = await client.query(
        "select to_regclass('drizzle.__drizzle_migrations')::text as table"
    )
    const { table } = regclass_row.parse(found[0])
    if (table === null) {
        return []
    } else {
        const { rows } = await client.query(
            "select hash, created_at from drizzle.__drizzle_migrations order by created_at"
        )
        return recorded_row
            .array()
            .parse(rows)
            .map((row) => ({ hash: row.hash, when: row.created_at }))
    }
}

// Run as a script, not imported
if (fileURLToPath(import.meta.url) === process.argv[1]) {
    const url = process.env.DATABASE_URL
    if (url === undefined) {
        console.error("DATABASE_URL isn't set")
        process.exit(1)
    }
    try {
        const { applied, total } = await migrateDatabase(url)
        console.info("Migrations applied", { applied, total })
    } catch (error) {
        console.error("Migrations failed, and rolled back", { error })
        process.exit(1)
    }
}
