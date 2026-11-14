import { queryOptions } from "@tanstack/react-query"
import { client } from "@/backend/client"

/**
 * Whether the server and its database are up (`GET /api/health`), through
 * the API's typed client: the pattern every query follows. A queryOptions
 * object lives here when more than one place uses it.
 */
export const healthQuery = queryOptions({
    queryKey: ["health"],
    queryFn: async () => {
        const response = await client.api.health.$get()
        return response.ok
    },
    // Asked once a visit; the page doesn't need it live
    staleTime: Number.POSITIVE_INFINITY,
    retry: false
})
