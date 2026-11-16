import { mutationOptions, queryOptions } from "@tanstack/react-query"
import type { InferResponseType } from "hono/client"
import { client } from "@/backend/client"
import { FailedRequest, readFailure } from "./failures"

// The workflows' runs (backend/workflows/routes.ts), for the dashboard's
// Workflows screen, which asks again every couple of seconds while it's
// open and the tab is in front, so a run moves as it runs

// How often an open screen asks again
const LIVE_EVERY = 2000

/** A run, as the list of runs has it. */
export type RunSummary = InferResponseType<
    typeof client.api.workflows.runs.$get,
    200
>["runs"][number]

/** A run with what it returned and its steps. */
export type RunDetail = InferResponseType<
    (typeof client.api.workflows.runs)[":id"]["$get"],
    200
>["run"]

/** The latest runs, newest first: GET /api/workflows/runs. */
export const runsQuery = queryOptions({
    queryKey: ["workflows", "runs"],
    queryFn: async () => {
        const response = await client.api.workflows.runs.$get()
        if (response.status === 200) {
            return (await response.json()).runs
        } else {
            throw new FailedRequest(await readFailure(response))
        }
    },
    refetchInterval: LIVE_EVERY
})

/**
 * One run with its steps: GET /api/workflows/runs/:id, asked again while
 * it's still to finish.
 */
export function runQuery(id: string) {
    return queryOptions({
        queryKey: ["workflows", "runs", id],
        queryFn: async () => {
            const response = await client.api.workflows.runs[":id"].$get({
                param: { id }
            })
            if (response.status === 200) {
                return (await response.json()).run
            } else {
                throw new FailedRequest(await readFailure(response))
            }
        },
        refetchInterval: (query) => {
            const status = query.state.data?.status
            return status === "queued" || status === "running"
                ? LIVE_EVERY
                : false
        }
    })
}

/** Running a failed or canceled run again, from where it stopped. */
export const retryRun = mutationOptions({
    mutationKey: ["workflows", "retry"],
    mutationFn: async (input: { id: string }) => {
        const response = await client.api.workflows.runs[":id"].retry.$post({
            param: input
        })
        if (response.status === 200) {
            return null
        } else {
            throw new FailedRequest(await readFailure(response))
        }
    },
    onSuccess: async (_data, _input, _result, context) => {
        await context.client.invalidateQueries({ queryKey: ["workflows"] })
    }
})
