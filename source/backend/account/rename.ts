import { eq } from "drizzle-orm"
import type { Database } from "@/database"
import { users } from "@/database/schema"

/** Sets what someone would like to be called, or clears it with null. */
export async function renameUser(
    database: Database,
    id: string,
    name: string | null
) {
    const [renamed] = await database
        .update(users)
        .set({ name })
        .where(eq(users.id, id))
        .returning({ name: users.name })
    return renamed ?? null
}
