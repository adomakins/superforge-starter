import type { Database } from "@/database"
import type { Storage } from "@/database/storage"

// What every API route sees on `c`: what `index.ts` puts on it, the
// database and the Storage bucket. A test puts its own.
export type ApiEnv = {
    Variables: {
        database: Database
        storage: Storage
    }
}
