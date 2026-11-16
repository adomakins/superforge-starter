import { queryOptions } from "@tanstack/react-query"
import { z } from "zod"
import { client } from "@/backend/client"
import { operationResult } from "@/utilities/primitives/result"
import { failure_details } from "@/utilities/schemas/failures"
import { readFailure } from "./failures"

/** What the health check answers the page: up, or the failure the API sent. */
export const health_status = operationResult(z.null(), failure_details)
export type HealthStatus = z.infer<typeof health_status>

/** A health check's answer, and the round trip it took, as the browser timed it. */
export const health_check = z.object({
    status: health_status,
    milliseconds: z.number().int().nonnegative()
})
export type HealthCheck = z.infer<typeof health_check>

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
