import { type ApiFailure, api_failure } from "@/utilities/schemas/failures"

/**
 * What a failed answer from the API says went wrong, in the one shape every
 * route fails with (utilities/schemas/failures.ts), for a query to hand
 * the page. One that isn't in that shape, like the page Railway's proxy
 * answers with while the server is down, reads as `unavailable`.
 */
export async function readFailure(
    response: Pick<Response, "status" | "json">
): Promise<ApiFailure> {
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

/**
 * What a mutation throws when the API answers a failure, so the page can
 * say what went wrong by its `reason`: TanStack Query hands a mutation's
 * error to the page rather than its answer. A request that got no answer
 * at all throws as `fetch` does, which a page reads as `unavailable`
 * (`failureOf`).
 */
export class FailedRequest extends Error {
    failure: ApiFailure

    constructor(failure: ApiFailure) {
        super(failure.message)
        this.name = "FailedRequest"
        this.failure = failure
    }
}

/** What made a mutation fail: the API's failure, or `unavailable`. */
export function failureOf(error: Error): ApiFailure {
    if (error instanceof FailedRequest) {
        return error.failure
    } else {
        return { reason: "unavailable", message: error.message }
    }
}
