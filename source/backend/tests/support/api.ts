import { testClient } from "hono/testing"
import { apiWith } from "@/backend"
import type { Access } from "@/backend/auth/access"
import type { ApiEnvironment } from "@/backend/context"
import { standInInfra } from "@/backend/infra/stand-in"
import { recordedWorkflows } from "@/backend/workflows/tests/support/recorded"
import { Storage } from "@/database/storage"
import { testDatabase } from "@/database/tests/support/database"
import { memoryStore } from "@/database/tests/support/storage"
import type { VisitorMode } from "@/utilities/visitors"

// Who can sign in, in a test unless it says otherwise: anyone, with no one
// internal from their first sign-in, whatever this app's ACCESS says
const OPEN: Access = { sign_in: "anyone", internal_emails: [] }

// Whom the site remembers, in a test unless it says otherwise: the mode
// the template ships with, whatever this app's VISITOR_MODE says
const REMEMBER: VisitorMode = "remember"

/**
 * The whole API, as the server mounts it (`apiWith()`), on a database of
 * the test's own, the bucket's bytes in memory, workflows recorded rather
 * than run, Infra's stand-in, so no test reaches Infra (its sign-ins
 * answer their code, as a test key's do), anyone able to sign in, and
 * visitors remembered as the template ships (`remember`): what a route's
 * test calls, through the typed client
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
        workflows: replacing.workflows ?? recorded.workflows,
        infra: replacing.infra ?? standInInfra(),
        access: replacing.access ?? OPEN,
        visitor_mode: replacing.visitor_mode ?? REMEMBER
    }
    const api = apiWith(() => variables)
    return {
        api,
        client: testClient(api),
        database: variables.database,
        // What the routes kept in the bucket, the workflows they started and
        // retried, and the runs the workflows list, which a test can add to
        files: store.files,
        started: recorded.started,
        retried: recorded.retried,
        runs: recorded.runs
    }
}
