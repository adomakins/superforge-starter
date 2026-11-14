import type { Database } from "@/database"

// What every API route sees on `c`: what `index.ts` puts on it. A test puts
// its own.
export type ApiEnv = {
    Variables: {
        database: Database
    }
}
