import type { Database } from "@/database"
import type { Storage } from "@/database/storage"

// What every API route sees on its `context`: what `index.ts` puts on it, the
// database and the Storage bucket. A test puts its own.
export type ApiEnvironment = {
    Variables: {
        database: Database
        storage: Storage
    }
}
