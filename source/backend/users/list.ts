import { and, desc, eq, gt, sql } from "drizzle-orm"
import type { Database } from "@/database"
import { sessions, users } from "@/database/schema"
import { now } from "@/database/time"

/**
 * Everyone who can sign in, newest first, for the dashboard's People
 * screen: who they are, their role, when they joined and last signed in,
 * and how many browsers they're signed in on now.
 */
export async function listUsers(database: Database) {
    return await database
        .select({
            id: users.id,
            email: users.email,
            name: users.name,
            role: users.role,
            created_at: users.created_at,
            signed_in_at: users.signed_in_at,
            // count() answers a bigint, which pg hands over as a string
            sessions: sql<number>`count(${sessions.token_hash})::integer`
        })
        .from(users)
        .leftJoin(
            sessions,
            and(eq(sessions.user_id, users.id), gt(sessions.expires_at, now))
        )
        .groupBy(users.id)
        .orderBy(desc(users.created_at))
}

/** Someone on the People screen, as `listUsers` answers them. */
export type ListedUser = Awaited<ReturnType<typeof listUsers>>[number]
