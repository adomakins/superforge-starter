import { randomUUID } from "node:crypto"
import type { Workflows } from "../../define"

/**
 * Workflows that are recorded rather than run, for a route's test to put on
 * its `context` in place of the server's (`testApi()` does): each start,
 * with its workflow's name, input and id, in `started`. A test of what a
 * workflow does runs its body itself, or runs it on DBOS as
 * engine.test.ts does.
 */
export function recordedWorkflows() {
    const started: { workflow: string; input: unknown; id: string }[] = []
    const workflows: Workflows = {
        async start(workflow, input, options = {}) {
            const id = options.id ?? randomUUID()
            started.push({ workflow: workflow.name, input, id })
            return id
        }
    }
    return { workflows, started }
}
