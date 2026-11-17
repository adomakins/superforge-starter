import { eq, sql } from "drizzle-orm"
import type { Database } from "@/database"
import { users } from "@/database/schema"
import { now } from "@/database/time"
import { type Access, listedAsInternal } from "./access"
import {
    SESSION_USER_COLUMNS,
    type SessionUser,
    startSession
} from "./sessions"

/**
 * Whether `email` may start signing in, before Infra is asked to email it:
 * anyone may when anyone can sign in, and otherwise only someone already
 * on the People screen, or listed as internal (access.ts).
 */
export async function maySignIn(
    database: Database,
    access: Access,
    email: string
) {
    if (access.sign_in === "anyone" || listedAsInternal(access, email)) {
        return true
    } else {
        const [found] = await database
            .select({ id: users.id })
            .from(users)
            .where(eq(users.email, email))
        return found !== undefined
    }
}

/**
 * Signs in the user with this email, once Infra has said it's theirs: makes
 * the user the first time the address signs in, when anyone may (`internal`
 * when access.ts lists the address, `external` otherwise), marks them
 * signed in now, and starts a session in place of this browser's
 * (`replacing`), all together. Answers the user, the new session's token,
 * for its cookie, and whether this sign-in made them. Refuses someone
 * nobody added when only listed people may sign in.
 */
export async function signIn(
    database: Database,
    {
        email,
        replacing,
        user_agent,
        access
    }: {
        email: string
        replacing: string | undefined
        user_agent: string | null
        access: Access
    }
): AsyncOperation<
    { user: SessionUser; token: string; joined: boolean },
    "not-listed"
> {
    return await database.transaction(async (transaction) => {
        const internal = listedAsInternal(access, email)
        let signed_in: SessionUser
        let joined: boolean
        if (access.sign_in === "listed" && !internal) {
            const [user] = await transaction
                .update(users)
                .set({ signed_in_at: now })
                .where(eq(users.email, email))
                .returning(SESSION_USER_COLUMNS)
            if (user === undefined) {
                return { ok: false, error: "not-listed" }
            } else {
                signed_in = user
                joined = false
            }
        } else {
            const [user] = await transaction
                .insert(users)
                .values({
                    email,
                    role: internal ? "internal" : "external",
                    signed_in_at: now
                })
                .onConflictDoUpdate({
                    target: users.email,
                    set: { signed_in_at: now }
                })
                .returning({
                    ...SESSION_USER_COLUMNS,
                    // Whether the insert made the row, rather than updating
                    // it (a comparison, so a boolean)
                    joined: sql<boolean>`xmax = 0`
                })
            if (user === undefined) {
                // An insert that updates on conflict always answers its row
                throw new Error("A user's upsert answered no row")
            } else {
                const { joined: made, ...rest } = user
                signed_in = rest
                joined = made
            }
        }

        const token = await startSession(
            transaction,
            signed_in.id,
            replacing,
            user_agent
        )
        return { ok: true, data: { user: signed_in, token, joined } }
    })
}
