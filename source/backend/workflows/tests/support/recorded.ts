import { randomUUID } from "node:crypto"
import type { Workflows } from "../../define"
import type { Run, RunWithSteps } from "../../runs"

/**
 * Workflows that are recorded rather than run, for a route's test to put on
 * its `context` in place of the server's (`testApi()` does): each start,
 * with its workflow's name, input and id, in `started`, and each retry's
 * run id in `retried`. The runs it lists are what it started, queued, and
 * any a test puts in `runs` itself, like a failed one with its steps. A
 * test of what a workflow does runs its body itself, or runs it on DBOS as
 * engine.test.ts does.
 */
export function recordedWorkflows() {
    const started: { workflow: string; input: unknown; id: string }[] = []
    const retried: string[] = []
    const runs = new Map<string, RunWithSteps>()

    const workflows: Workflows = {
        async start(workflow, input, options = {}) {
            const id = options.id ?? randomUUID()
            started.push({ workflow: workflow.name, input, id })
            if (!runs.has(id)) {
                runs.set(id, {
                    id,
                    workflow: workflow.name,
                    title: workflow.title(input) ?? workflow.name,
                    status: "queued",
                    input: JSON.stringify(input, null, 2),
                    error: null,
                    created_at: new Date().toISOString(),
                    completed_at: null,
                    output: null,
                    steps: []
                })
            }
            return id
        },

        async runs({ limit = 100 } = {}) {
            return [...runs.values()]
                .sort((one, other) =>
                    other.created_at.localeCompare(one.created_at)
                )
                .slice(0, limit)
                .map(({ output: _output, steps: _steps, ...run }): Run => run)
        },

        async run(id) {
            return runs.get(id) ?? null
        },

        async retry(id) {
            const run = runs.get(id)
            if (run === undefined) {
                return { ok: false, error: "not-found" }
            } else if (run.status !== "failed" && run.status !== "canceled") {
                return { ok: false, error: "not-stopped" }
            } else {
                retried.push(id)
                runs.set(id, { ...run, status: "queued", error: null })
                return { ok: true, data: null }
            }
        }
    }
    return { workflows, started, retried, runs }
}
