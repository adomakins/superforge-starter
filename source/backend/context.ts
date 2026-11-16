import type { Database } from "@/database"
import type { Storage } from "@/database/storage"
import type { Infra } from "./infra"
import type { Workflows } from "./workflows/define"

// What every API route sees on its `context`: the database, the Storage
// bucket, how to start a workflow, and Superforge Infra. `index.ts` puts the
// server's there, and a test its own (tests/support/api.ts).
export type ApiEnvironment = {
    Variables: {
        database: Database
        storage: Storage
        workflows: Workflows
        infra: Infra
    }
}
