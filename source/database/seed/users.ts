import { createHash } from "node:crypto"
import { inArray } from "drizzle-orm"
import type { Database } from "@/database"
import { sessions, users } from "@/database/schema"
import { fromNow } from "@/database/time"
import { DAY } from "@/utilities/primitives/durations"
import type { Seeder } from "./seed"

// Sample users and their sessions: one signed in now, one whose session has
// run out, and one who's never signed in, like someone added by hand before
// they do. Their addresses are example.com's, which reach nobody.

const SAMPLE_USERS = [
    { email: "ada@example.com", signed_in_at: fromNow(-2 * DAY) },
    { email: "grace@example.com", signed_in_at: fromNow(-45 * DAY) },
    { email: "linus@example.com", signed_in_at: null }
]

// Each session by its user, with the token its cookie would hold: its
// SHA-256 is what's kept, as a real session's is (backend/auth/tokens.ts)
const SAMPLE_SESSIONS = [
    {
        email: "ada@example.com",
        token: "sample-session-ada",
        expires_at: fromNow(28 * DAY)
    },
    {
        email: "grace@example.com",
        token: "sample-session-grace",
        expires_at: fromNow(-15 * DAY)
    }
]

/** The sample users, in place of every user there was. */
export const seedUsers: Seeder = async (transaction: Database) => {
    await transaction.delete(users)
    const rows = await transaction
        .insert(users)
        .values(SAMPLE_USERS)
        .returning({ id: users.id })
    return { table: "users", rows: rows.length }
}

/** Their sessions, in place of every session there was. */
export const seedSessions: Seeder = async (transaction: Database) => {
    await transaction.delete(sessions)
    const owners = await transaction
        .select({ id: users.id, email: users.email })
        .from(users)
        .where(
            inArray(
                users.email,
                SAMPLE_SESSIONS.map((session) => session.email)
            )
        )
    const values = SAMPLE_SESSIONS.map((session) => {
        const owner = owners.find((user) => user.email === session.email)
        if (owner === undefined) {
            throw new Error("A sample session's user wasn't seeded")
        }
        return {
            token_hash: createHash("sha256")
                .update(session.token)
                .digest("hex"),
            user_id: owner.id,
            expires_at: session.expires_at
        }
    })
    const rows = await transaction
        .insert(sessions)
        .values(values)
        .returning({ token_hash: sessions.token_hash })
    return { table: "auth.sessions", rows: rows.length }
}
