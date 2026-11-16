import { testClient } from "hono/testing"
import { apiWith } from "@/backend"
import type { ApiEnvironment } from "@/backend/context"
import { recordedWorkflows } from "@/backend/workflows/tests/support/recorded"
import { Storage } from "@/database/storage"
import { testDatabase } from "@/database/tests/support/database"
import { memoryStore } from "@/database/tests/support/storage"

/**
 * The whole API, as the server mounts it (`apiWith()`), on a database of
 * the test's own, the bucket's bytes in memory, and workflows recorded
 * rather than run: what a route's test calls, through the typed client
 * (`client.api.health.$get()`), or `api.request(path)` for a path no route
 * declares. Anything in `replacing` goes on `context` in place of the
 * test's own. Call it inside a test.
 */
export async function testApi(
    replacing: Partial<ApiEnvironment["Variables"]> = {}
) {
    const store = memoryStore()
    const recorded = recordedWorkflows()
    const variables: ApiEnvironment["Variables"] = {
        database: replacing.database ?? (await testDatabase()),
        storage: replacing.storage ?? new Storage(store.store),
        workflows: replacing.workflows ?? recorded.workflows
    }
    const api = apiWith(() => variables)
    return {
        api,
        client: testClient(api),
        database: variables.database,
        // What the routes kept in the bucket, and the workflows they started
        files: store.files,
        started: recorded.started
    }
}
