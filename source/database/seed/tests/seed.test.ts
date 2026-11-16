import { is } from "drizzle-orm"
import { PgTable } from "drizzle-orm/pg-core"
import { expect, test } from "vitest"
import * as schema from "@/database/schema"
import { testDatabase } from "@/database/tests/support/database"
import { tableName } from "@/database/tests/support/fill"
import { seed, UNSEEDED } from "../seed"

// The seed (`pnpm database:seed`), on an empty database with every
// migration, so a schema change that breaks it fails here rather than in the
// next person's dev server. Seeding twice replaces, rather than adds to, what
// the first wrote. And every table in schema.ts gets sample rows, or says in
// UNSEEDED why it has none, so a new table can't ship without either.

test("seeds an empty database, and seeds it again the same", async () => {
    const database = await testDatabase()
    const first = await seed(database)
    const second = await seed(database)
    expect(second).toEqual(first)
})

test("seeds every table, but the ones that say why not", async () => {
    const database = await testDatabase()
    const written = await seed(database)
    const tables = Object.values(schema)
        .filter((value) => is(value, PgTable))
        .map((table) => tableName(table))

    const missing = tables.filter(
        (table) => written[table] === undefined && UNSEEDED[table] === undefined
    )
    expect(
        missing,
        "Each of these tables needs a seeder in SEEDERS, or its reason in UNSEEDED (source/database/seed/seed.ts)"
    ).toEqual([])

    const empty = Object.entries(written)
        .filter(([, rows]) => rows === 0)
        .map(([table]) => table)
    expect(empty, "Each of these seeders wrote no rows").toEqual([])

    const unknown = [...Object.keys(written), ...Object.keys(UNSEEDED)].filter(
        (table) => !tables.includes(table)
    )
    expect(
        unknown,
        "These are named in seed.ts, but schema.ts has no such table"
    ).toEqual([])
})
