import { DBOS, type StepConfig } from "@dbos-inc/dbos-sdk"
import type { z } from "zod"
import type { Database } from "@/database"
import type { Storage } from "@/database/storage"
import { MINUTE } from "@/utilities/primitives/durations"
import { workflowsProcess } from "./process"
import type { QueueName } from "./queues"
import type { Run, RunWithSteps } from "./runs"

/**
 * A workflow: work that runs in the background, outside any request, and
 * picks up where it stopped when the process does (README.md). A feature
 * defines its own in its `workflows.ts` with `defineWorkflow`, lists them
 * in index.ts's WORKFLOWS, and a route starts one with
 * `context.var.workflows.start(workflow, input)`.
 */
export type Workflow<Input = unknown> = {
    // Its name in DBOS's tables, which runs already in flight are recorded
    // under: never rename one that has shipped
    name: string
    queue: QueueName
    // What it's started with, checked as each run starts
    input: z.ZodType<Input>
    // What a run of it is called on the dashboard, from what it was started
    // with as DBOS kept it, or null when that no longer fits the workflow
    title: (stored: unknown) => string | null
}

/** What a workflow's body runs with. */
export type WorkflowContext = {
    database: Database
    storage: Storage
    /**
     * Runs `callback` as a step: once it has returned, a run that starts
     * again, after a restart or a deploy, gets back what it returned rather
     * than running it again. One that throws is tried again (STEP below).
     * Each step in a run needs a name of its own.
     */
    step: <Result>(
        name: string,
        callback: () => Promise<Result>
    ) => Promise<Result>
}

/**
 * How a route starts workflows, and reads and retries their runs:
 * `context.var.workflows` (engine.ts's, through DBOS's own functions, never
 * its tables).
 */
export type Workflows = {
    /**
     * Puts a run of `workflow` on its queue, and answers its id. Starting
     * one under an id that's taken, running or finished, finds the one
     * there rather than starting another (DBOS's rule), so a route that
     * names the run after what it's for can start it twice harmlessly.
     */
    start<Input>(
        workflow: Workflow<Input>,
        input: Input,
        options?: { id?: string }
    ): Promise<string>
    /** The latest runs, newest first, of every workflow. */
    runs(options?: { limit?: number }): Promise<Run[]>
    /** One run, with what it returned and each step it has finished. */
    run(id: string): Promise<RunWithSteps | null>
    /**
     * Runs a failed or canceled run again under its id, from the step it
     * stopped at: the steps before it keep what they returned, and aren't
     * run again.
     */
    retry(id: string): AsyncOperation<null, "not-found" | "not-stopped">
}

// How a step is tried: again after 10 seconds when it throws, then twice as
// long each time, 8 attempts in all, which is about 21 minutes before the
// run fails. Every step can run again safely (README.md, "Steps"), so a
// database or a service that's down for a few minutes only delays a run.
// One attempt that runs for 10 minutes has hung, and counts as failed.
const STEP: StepConfig = {
    retriesAllowed: true,
    maxAttempts: 8,
    intervalSeconds: 10,
    backoffRate: 2,
    timeoutMS: 10 * MINUTE
}

/**
 * A workflow named `name`, on the `queue` queue (`background` unless it
 * says), which runs `run` with its input, once that's checked with `input`.
 * Its body only ever reads and writes through `context.step`, and calls
 * operations, the same functions the routes call, to do so (README.md).
 */
export function defineWorkflow<Input, Output>(definition: {
    name: string
    queue?: QueueName
    input: z.ZodType<Input>
    // What a run is called on the dashboard, like "Tell the team about
    // ada@example.com"; the workflow's name when it has none
    title?: (input: Input) => string
    run: (input: Input, context: WorkflowContext) => Promise<Output>
}): Workflow<Input> {
    const { name, input, run, title } = definition

    // Whichever evaluation of the feature's module came last is what runs.
    // A run's input was stored by whatever version started it, so it's
    // checked against this one before anything steers on it.
    workflowsProcess().bodies.set(name, async (stored, context) => {
        const parsed = input.safeParse(stored)
        if (!parsed.success) {
            console.error("A workflow's input doesn't fit it", {
                workflow: name,
                id: DBOS.workflowID,
                issues: parsed.error.issues
            })
            throw new Error(`The ${name} workflow's input doesn't fit it`)
        } else {
            return await run(parsed.data, context)
        }
    })
    return {
        name,
        queue: definition.queue ?? "background",
        input,
        title: (stored) => {
            const parsed = input.safeParse(stored)
            if (!parsed.success) {
                return null
            } else if (title === undefined) {
                return name
            } else {
                return title(parsed.data)
            }
        }
    }
}

/**
 * Registers `workflow` with DBOS, once a process, which has to come before
 * DBOS launches (engine.ts does it as it starts). What DBOS runs looks up
 * the body as it starts, so it's always the latest.
 */
export function register(workflow: Workflow) {
    const { registered } = workflowsProcess()
    if (!registered.has(workflow.name)) {
        registered.set(
            workflow.name,
            DBOS.registerWorkflow(
                (input: unknown) => runBody(workflow, input),
                {
                    name: workflow.name
                }
            )
        )
    }
}

// A run of a workflow, as DBOS starts it, with what this process runs
// workflows with
async function runBody(workflow: Workflow, input: unknown) {
    const { bodies, dependencies } = workflowsProcess()
    const body = bodies.get(workflow.name)
    if (body === undefined) {
        throw new Error(`The ${workflow.name} workflow has no body`)
    } else if (dependencies === null) {
        throw new Error("A workflow ran before the workflows started")
    } else {
        return await body(input, {
            database: dependencies.database,
            storage: dependencies.storage,
            step: (name, callback) => DBOS.runStep(callback, { ...STEP, name })
        })
    }
}
