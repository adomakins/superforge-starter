import { randomUUID } from "node:crypto"
import { z } from "zod"
import type { Workflows } from "../../define"

/** A run a route started: its workflow's name, its input, and its id. */
export const started_run = z.object({
    workflow: z.string(),
    input: z.unknown(),
    id: z.string()
})

/**
 * Workflows that are recorded rather than run, for a route's test to put on
 * its `context` in place of the server's (`testApi()` does): each start,
 * with its workflow's name, input and id, in `started`. A test of what a
 * workflow does runs its body itself, or runs it on DBOS as
 * engine.test.ts does.
 */
export function recordedWorkflows() {
    const started: z.infer<typeof started_run>[] = []
    const workflows: Workflows = {
        async start(workflow, input, options = {}) {
            const id = options.id ?? randomUUID()
            started.push({ workflow: workflow.name, input, id })
            return id
        }
    }
    return { workflows, started }
}
