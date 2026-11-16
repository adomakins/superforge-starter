import { useQuery } from "@tanstack/react-query"
import { client } from "@/backend/client"

/**
 * What the health check found, as the mockups show it. `/api/health` answers
 * 200 when it reached the database and 503 when it didn't; anything else, or
 * no answer at all, means the server itself didn't answer.
 */
export type Health =
    | { state: "checking" }
    | { state: "up"; milliseconds: number }
    | { state: "database-down"; milliseconds: number }
    | { state: "unreachable" }

type Answer =
    | { answered: "up"; milliseconds: number }
    | { answered: "database-down"; milliseconds: number }
    | { answered: "not-the-api"; status: number }

// `GET /api/health`, timed in the browser, so a page can show the round trip
async function checkHealth(): Promise<Answer> {
    const started = performance.now()
    const response = await client.api.health.$get()
    const milliseconds = Math.max(1, Math.round(performance.now() - started))
    if (response.ok) {
        return { answered: "up", milliseconds }
    } else if (response.status === 503) {
        return { answered: "database-down", milliseconds }
    } else {
        console.warn("The health check got an answer that isn't the API's", {
            status: response.status
        })
        return { answered: "not-the-api", status: response.status }
    }
}

/**
 * The health check, asked from the browser once the page is up, since the
 * page itself is prerendered. `checking` is true while it runs, including a
 * check asked again with `checkAgain`.
 */
export function useHealth() {
    const query = useQuery({
        queryKey: ["health", "timed"],
        queryFn: checkHealth,
        staleTime: Number.POSITIVE_INFINITY,
        retry: false
    })

    let health: Health
    if (query.isFetching || query.isPending) {
        health = { state: "checking" }
    } else if (query.data === undefined) {
        health = { state: "unreachable" }
    } else if (query.data.answered === "not-the-api") {
        health = { state: "unreachable" }
    } else {
        health = {
            state: query.data.answered,
            milliseconds: query.data.milliseconds
        }
    }

    return {
        health,
        checking: query.isFetching,
        checkAgain: () => {
            void query.refetch()
        }
    }
}
