import { and, eq, gt, lt, sql } from "drizzle-orm"
import type { Database } from "@/database"
import { sessions, users } from "@/database/schema"
import { fromNow, now } from "@/database/time"
import { DAY } from "@/utilities/primitives/durations"
import { randomToken, sha256 } from "./tokens"

// The sessions, in `auth.sessions`: operations on them by their token, which
// only the browser's cookie holds (signed-in.ts). Nothing else reads the
// cookie or this table: a route that needs the user uses `signedIn`.

/**
 * How long a session lasts from when it was last renewed, so someone who
 * keeps coming back never has to sign in again.
 */
export const SESSION_LIFETIME = 30 * DAY

// A session in use is renewed at most this often, which spares the table a
// write on every request
const RENEW_EVERY = DAY
const RENEW_BEFORE = fromNow(SESSION_LIFETIME - RENEW_EVERY)

/**
 * Who a session signs in, as every route that needs them sees them: who
 * they are, and when they first signed in.
 */
export type SessionUser = Pick<
    typeof users.$inferSelect,
    "id" | "email" | "created_at"
>

/**
 * Starts a session for this user, ending the one this browser had
 * (`replacing`, its cookie's token), and answers its token, for the
 * cookie. Their sessions that have run out are cleared away with it. A
 * user who never signs in again leaves theirs, which no request accepts
 * (`liveSession`): a workflow can prune them once there are enough to
 * matter.
 */
export async function startSession(
    database: Database,
    user_id: string,
    replacing: string | undefined
) {
    if (replacing !== undefined) {
        await endSession(database, replacing)
    }
    await database
        .delete(sessions)
        .where(and(eq(sessions.user_id, user_id), lt(sessions.expires_at, now)))

    const token = randomToken()
    await database.insert(sessions).values({
        token_hash: await sha256(token),
        user_id,
        expires_at: fromNow(SESSION_LIFETIME)
    })
    return token
}

/** Ends the session behind this token, if it's still there. */
export async function endSession(database: Database, token: string) {
    await database
        .delete(sessions)
        .where(eq(sessions.token_hash, await sha256(token)))
}

/**
 * The live session behind this token, with its user, and whether it's been
 * long enough since it was renewed to renew it again; undefined for a
 * token with none, or one that has run out.
 */
export async function liveSession(database: Database, token: string) {
    const [session] = await database
        .select({
            user: {
                id: users.id,
                email: users.email,
                created_at: users.created_at
            },
            // A comparison, so Postgres answers a boolean
            renewable: sql<boolean>`${sessions.expires_at} < ${RENEW_BEFORE}`
        })
        .from(sessions)
        .innerJoin(users, eq(sessions.user_id, users.id))
        .where(
            and(
                eq(sessions.token_hash, await sha256(token)),
                gt(sessions.expires_at, now)
            )
        )
    return session
}

/**
 * Gives the session behind this token its whole lifetime again, and says
 * whether this call was the one that did: of the requests a page makes at
 * once, only one is, and a session signed out of meanwhile has nothing to
 * renew.
 */
export async function renewSession(database: Database, token: string) {
    const renewed = await database
        .update(sessions)
        .set({ expires_at: fromNow(SESSION_LIFETIME) })
        .where(
            and(
                eq(sessions.token_hash, await sha256(token)),
                lt(sessions.expires_at, RENEW_BEFORE)
            )
        )
        .returning({ token_hash: sessions.token_hash })
    return renewed.length > 0
}
