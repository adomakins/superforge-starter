import { expect, test } from "vitest"
import { users } from "@/database/schema"
import { testDatabase } from "@/database/tests/support/database"
import { findUser, internalEmails } from "../find"

// What the sign-up notice's steps read (users/workflows.ts): whom it's
// about, and whom it goes to

test("the team is the business's own people, but the one it's about", async () => {
    const database = await testDatabase()
    const [ada, , maria] = await database
        .insert(users)
        .values([
            { email: "ada@example.com", role: "internal" },
            { email: "grace@example.com", role: "internal" },
            { email: "maria@example.com", role: "external" }
        ])
        .returning({ id: users.id })
    if (ada === undefined || maria === undefined) {
        throw new Error("The users weren't made")
    }

    expect(await internalEmails(database, maria.id)).toEqual([
        "ada@example.com",
        "grace@example.com"
    ])
    expect(await internalEmails(database, ada.id)).toEqual([
        "grace@example.com"
    ])
})

test("someone removed is found as no one", async () => {
    const database = await testDatabase()
    expect(
        await findUser(database, "00000000-0000-4000-8000-000000000000")
    ).toBeNull()
})
