import { expect, test } from "vitest"
import { testDatabase } from "@/database/tests/support/database"
import { seed } from "../seed"

// The seed (`pnpm database:seed`), on an empty database with every
// migration, so a schema change that breaks it fails here rather than in the
// next person's dev server. Seeding twice replaces, rather than adds to, what
// the first wrote.

test("seeds an empty database, and seeds it again the same", async () => {
    const database = await testDatabase()
    const first = await seed(database)
    const second = await seed(database)
    expect(second).toEqual(first)
})
