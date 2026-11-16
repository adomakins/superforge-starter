import { queryOptions } from "@tanstack/react-query"
import { client } from "@/backend/client"
import type { ApiFailure } from "@/utilities/schemas/failures"
import { readFailure } from "./failures"

/**
 * A health check's answer, up or the failure the API sent, and the round
 * trip it took, as the browser timed it.
 */
export type HealthCheck = {
    status: OperationResult<null, ApiFailure>
    milliseconds: number
}

/**
 * Whether the server and its database are up (`GET /api/health`), through
 * the API's typed client: the pattern every query follows. It answers the
 * failure the API sent, read with `readFailure`, rather than throwing it, so
 * the page can say what went wrong; only a request that got no answer at
 * all throws. A queryOptions object lives here when more than one place
 * uses it.
 */
export const healthQuery = queryOptions({
    queryKey: ["health"],
    queryFn: async (): Promise<HealthCheck> => {
        const started = performance.now()
        const response = await client.api.health.$get()
        const milliseconds = Math.round(performance.now() - started)
        if (response.ok) {
            return { status: { ok: true, data: null }, milliseconds }
        } else {
            return {
                status: { ok: false, error: await readFailure(response) },
                milliseconds
            }
        }
    },
    // Asked once a visit, and again when the home page asks
    staleTime: Number.POSITIVE_INFINITY,
    retry: false
})
