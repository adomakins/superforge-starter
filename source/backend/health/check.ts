import { sql } from "drizzle-orm"
import { z } from "zod"
import type { Database } from "@/database"
import { operationResult } from "@/utilities/primitives/result"

/** What checking the database answers: it answered, or it didn't. */
export const database_check = operationResult(
    z.null(),
    z.enum(["database-unreachable"])
)
export type DatabaseCheck = z.infer<typeof database_check>

/**
 * Whether the database answers. An operation, as every function that
 * touches the database is: it takes the database and its input, and
 * answers what happened, for a route or a workflow's step to act on.
 */
export async function checkDatabase(
    database: Database
): Promise<DatabaseCheck> {
    try {
        await database.execute(sql`select 1`)
        return { ok: true, data: null }
    } catch (error) {
        console.error("Database health check failed", { error })
        return { ok: false, error: "database-unreachable" }
    }
}
