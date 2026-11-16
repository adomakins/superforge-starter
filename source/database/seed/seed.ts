import { connect, type Database } from "@/database"
import { localDatabaseUrl } from "@/database/local"
import { seedSessions, seedUsers } from "./users"

/**
 * Sample rows for this checkout's database, so a dev server has something
 * to show and a change can be tried on real-looking data:
 * `pnpm database:seed` (workbench/scripts/seed.mjs). **Every table gets a
 * seeder here**, in the same change that adds the table, which replaces its
 * sample rows, like:
 *
 *   async function seedCustomers(transaction: Database) {
 *       await transaction.delete(customers)
 *       const rows = await transaction
 *           .insert(customers)
 *           .values(SAMPLE_CUSTOMERS)
 *           .returning()
 *       return { table: "customers", rows: rows.length }
 *   }
 *
 * Keep it small and written out by hand, so it works with no credential,
 * offline and in CI, and covers every state a screen shows at least once.
 * A table whose rows nothing should make up, like a log a job writes, is in
 * UNSEEDED instead, with why. The rows are what each
 * branch's migrations first run over, in every checkout's database as
 * `pnpm dev` starts, so a table left empty is one a migration is never
 * tried on before it ships. Its test seeds an empty database, and fails a
 * table that's in neither (tests/seed.test.ts), so a schema change that
 * breaks the seed, or a table without one, fails `pnpm check`, not the next
 * person's dev server.
 */

export type Seeder = (
    transaction: Database
) => Promise<{ table: string; rows: number }>

// In the order they run: a table after the ones its rows point at
const SEEDERS: Seeder[] = [seedUsers, seedSessions]

/**
 * The tables that get no sample rows, each with why, by its name as a
 * seeder names it: bare in `public`, after its schema in another, like
 * `internal.error_log`.
 */
export const UNSEEDED: Record<string, string> = {}

/**
 * Writes every seeder's rows in one transaction, so a failure leaves the
 * database as it was, and says how many each wrote.
 */
export async function seed(database: Database) {
    return await database.transaction(async (transaction) => {
        const written: Record<string, number> = {}
        for (const seeder of SEEDERS) {
            const { table, rows } = await seeder(transaction)
            written[table] = rows
        }
        return written
    })
}

/** `pnpm database:seed`: the seed, in this checkout's database. */
export async function seedLocalDatabase() {
    const database = connect(localDatabaseUrl(), 1)
    try {
        const written = await seed(database)
        console.info("Seeded this checkout's database", { written })
    } finally {
        await database.$client.end()
    }
}
