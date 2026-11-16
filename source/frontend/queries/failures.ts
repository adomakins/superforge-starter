import { type ApiFailure, api_failure } from "@/utilities/schemas/failures"

/**
 * What a failed answer from the API says went wrong, in the one shape every
 * route fails with (utilities/schemas/failures.ts), for a query to hand
 * the page. One that isn't in that shape, like the page Railway's proxy
 * answers with while the server is down, reads as `unavailable`.
 */
export async function readFailure(response: {
    status: number
    json(): Promise<unknown>
}): Promise<ApiFailure> {
    try {
        const parsed = api_failure.safeParse(await response.json())
        if (parsed.success) {
            return parsed.data.error
        } else {
            console.warn("The API failed without its failure shape", {
                status: response.status,
                issues: parsed.error.issues
            })
        }
    } catch (error) {
        console.warn("The API failed without JSON", {
            status: response.status,
            error
        })
    }
    return { reason: "unavailable", message: "The server didn't answer" }
}
