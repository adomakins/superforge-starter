import { mutationOptions, queryOptions } from "@tanstack/react-query"
import type { InferResponseType } from "hono/client"
import { client } from "@/backend/client"
import type { AgentScope } from "@/utilities/schemas/agents"
import { FailedRequest, readFailure } from "./failures"

// Claude connecting to the app's MCP (backend/agents/routes.ts): the Allow
// page's request, allowing or declining it, and someone's connections

/** Someone's connection, as the account page lists it */
export type AgentConnection = InferResponseType<
    typeof client.api.account.connections.$get,
    200
>["connections"][number]

/** What Claude asked for: GET /api/connect/:request_id */
export function connectRequestQuery(request_id: string) {
    return queryOptions({
        queryKey: ["connect", request_id],
        queryFn: async () => {
            const response = await client.api.connect[":request_id"].$get({
                param: { request_id }
            })
            if (response.status === 200) {
                return (await response.json()).request
            } else {
                throw new FailedRequest(await readFailure(response))
            }
        },
        retry: false
    })
}

/** Allowing it: answers where the browser goes back to Claude */
export const allowAgent = mutationOptions({
    mutationKey: ["connect", "allow"],
    mutationFn: async (input: { request_id: string; scopes: AgentScope[] }) => {
        const response = await client.api.connect[":request_id"].allow.$post({
            param: { request_id: input.request_id },
            json: { scopes: input.scopes }
        })
        if (response.status === 200) {
            return (await response.json()).redirect_to
        } else {
            throw new FailedRequest(await readFailure(response))
        }
    }
})

/** Declining it: answers where the browser goes back to Claude */
export const denyAgent = mutationOptions({
    mutationKey: ["connect", "deny"],
    mutationFn: async (input: { request_id: string }) => {
        const response = await client.api.connect[":request_id"].deny.$post({
            param: input
        })
        if (response.status === 200) {
            return (await response.json()).redirect_to
        } else {
            throw new FailedRequest(await readFailure(response))
        }
    }
})

/** Where someone has let Claude in: GET /api/account/connections */
export const accountConnectionsQuery = queryOptions({
    queryKey: ["account", "connections"],
    queryFn: async () => {
        const response = await client.api.account.connections.$get()
        if (response.status === 200) {
            return (await response.json()).connections
        } else {
            throw new FailedRequest(await readFailure(response))
        }
    }
})

/** Ending one of their connections */
export const endAgentConnection = mutationOptions({
    mutationKey: ["account", "end-connection"],
    mutationFn: async (input: { connection_id: string }) => {
        const response = await client.api.account.connections[
            ":connection_id"
        ].$delete({ param: input })
        if (response.status === 200) {
            return null
        } else {
            throw new FailedRequest(await readFailure(response))
        }
    },
    onSuccess: async (_data, _input, _result, context) => {
        await context.client.invalidateQueries({
            queryKey: accountConnectionsQuery.queryKey
        })
    }
})
