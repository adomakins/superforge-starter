import { queryOptions } from "@tanstack/react-query"
import { client } from "@/backend/client"
import type { ApiFailure } from "@/utilities/schemas/failures"
import { readFailure } from "./failures"

/**
 * Whether the server and its database are up (`GET /api/health`), through
 * the API's typed client: the pattern every query follows. It answers the
 * failure the API sent, read with `readFailure`, rather than throwing it, so
 * the page can say what went wrong. A queryOptions object lives here when
 * more than one place uses it.
 */
export const healthQuery = queryOptions({
    queryKey: ["health"],
    queryFn: async (): AsyncOperation<null, ApiFailure> => {
        const response = await client.api.health.$get()
        if (response.ok) {
            return { ok: true, data: null }
        } else {
            return { ok: false, error: await readFailure(response) }
        }
    },
    // Asked once a visit; the page doesn't need it live
    staleTime: Number.POSITIVE_INFINITY,
    retry: false
})
