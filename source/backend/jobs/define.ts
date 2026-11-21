import { z } from "zod"
import type { Database } from "@/database"
import {
    defineWorkflow,
    type Workflow,
    type WorkflowContext,
    type Workflows
} from "../workflows/define"

// A job: a change to the app's data that someone on the team, or Claude
// acting as one of them, starts on purpose, like cleaning up old rows or
// fixing a batch of contacts. Its code is in the codebase, reviewed and
// deployed like any other, and it runs as a workflow, in batches, picking
// up where it stopped (README.md). Nothing changes data any other way:
// never a script against production, never code sent to the server.

/** What a dry run answers: what the job would change, without changing it */
export type JobPlan = {
    /** In a sentence, for a person or Claude to read before going ahead */
    summary: string
    /** How many rows, or things, it would change */
    changes: number
}

/** A job, as the routes and the workflows' list see it */
export type Job = {
    // Its name in the route, /api/jobs/:name: never rename one that has
    // shipped, since its workflow's runs are recorded under it
    name: string
    /** What it does, for the person or Claude choosing it */
    description: string
    /** What it takes, as JSON Schema, for whoever calls it */
    input_schema: z.core.JSONSchema.BaseSchema
    /** The workflow that makes the change, which WORKFLOWS lists */
    workflow: Workflow
    /** Checks what it was given, and answers the job ready to plan or start */
    prepare(given: unknown): OperationResult<PreparedJob, z.core.$ZodIssue[]>
}

/** A job with its input checked */
export type PreparedJob = {
    /** The dry run: what it would change, reading only */
    plan(database: Database): Promise<JobPlan>
    /** Starts the change as a workflow run, and answers its id */
    start(workflows: Workflows): Promise<string>
}

/**
 * A job named `name`, which takes `input`, answers a dry run with `plan`,
 * reading only, and makes the change with `run`, a workflow's body: in
 * batches, each a step, every one safe to run again
 * (backend/workflows/README.md, "Steps"). A feature defines its own in its
 * `jobs.ts`, and lists them in index.ts's JOBS.
 */
export function defineJob<Input, Output>(definition: {
    name: string
    description: string
    input: z.ZodType<Input>
    plan: (database: Database, input: Input) => Promise<JobPlan>
    title?: (input: Input) => string
    run: (input: Input, context: WorkflowContext) => Promise<Output>
}): Job {
    const { name, description, input, plan, title, run } = definition
    const workflow = defineWorkflow({ name: `job-${name}`, input, title, run })
    return {
        name,
        description,
        input_schema: z.toJSONSchema(input, { io: "input" }),
        workflow,
        prepare(given) {
            const parsed = input.safeParse(given)
            if (!parsed.success) {
                return { ok: false, error: parsed.error.issues }
            } else {
                return {
                    ok: true,
                    data: {
                        plan: (database) => plan(database, parsed.data),
                        start: (workflows) =>
                            workflows.start(workflow, parsed.data)
                    }
                }
            }
        }
    }
}
