import { sql } from "drizzle-orm"
import type { Database } from "@/database"
import { users } from "@/database/schema"
import { now } from "@/database/time"
import { type SessionUser, startSession } from "./sessions"

/**
 * Signs in the user with this email, once Infra has said it's theirs: makes
 * the user the first time the address signs in, marks them signed in now,
 * and starts a session in place of this browser's (`replacing`), all
 * together. Answers the user and the new session's token, for its cookie.
 */
export async function signIn(
    database: Database,
    email: string,
    replacing: string | undefined
): Promise<{ user: SessionUser; token: string; joined: boolean }> {
    return await database.transaction(async (transaction) => {
        const [user] = await transaction
            .insert(users)
            .values({ email, signed_in_at: now })
            .onConflictDoUpdate({
                target: users.email,
                set: { signed_in_at: now }
            })
            .returning({
                id: users.id,
                email: users.email,
                created_at: users.created_at,
                // Whether the insert made the row, rather than updating it
                // (a comparison, so a boolean)
                joined: sql<boolean>`xmax = 0`
            })
        if (user === undefined) {
            // An insert that updates on conflict always answers its row
            throw new Error("A user's upsert answered no row")
        }

        const { joined, ...signed_in } = user
        const token = await startSession(transaction, user.id, replacing)
        return { user: signed_in, token, joined }
    })
}
