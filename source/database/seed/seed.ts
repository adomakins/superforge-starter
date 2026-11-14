import { connect, type Database } from "@/database"
import { localDatabaseUrl } from "@/database/local"

/**
 * Sample rows for this checkout's database, so a dev server has something
 * to show and a change can be tried on real-looking data:
 * `pnpm database:seed` (workbench/scripts/seed.mjs). Each table that wants
 * some gets a seeder here, which replaces its sample rows, like:
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
 * Its test seeds an empty database (tests/seed.test.ts), so a schema change
 * that breaks it fails `pnpm check`, not the next person's dev server.
 */

type Seeder = (
    transaction: Database
) => Promise<{ table: string; rows: number }>

// In the order they run: a table after the ones its rows point at
const SEEDERS: Seeder[] = []

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
