import { useQuery } from "@tanstack/react-query"
import { healthQuery } from "@/frontend/queries/health"

/**
 * What the health check found, as the home page tells it: still checking,
 * all up, the API up but its database not, or the API itself not
 * answering (no answer at all, or one that isn't the API's own).
 */
export type Finding =
    | { state: "checking" }
    | { state: "up"; milliseconds: number }
    | { state: "database-down"; milliseconds: number }
    | { state: "api-down" }

/**
 * The health check, asked from the browser once the page is up, since the
 * page itself is prerendered. `checking` is true while a check runs,
 * including one asked again with `checkAgain`.
 */
export function useFinding() {
    const query = useQuery(healthQuery)

    let found: Finding
    if (query.isFetching || query.isPending) {
        found = { state: "checking" }
    } else if (query.data === undefined) {
        found = { state: "api-down" }
    } else if (query.data.status.ok) {
        found = { state: "up", milliseconds: query.data.milliseconds }
    } else if (query.data.status.error.reason === "database-unreachable") {
        found = {
            state: "database-down",
            milliseconds: query.data.milliseconds
        }
    } else {
        found = { state: "api-down" }
    }

    return {
        found,
        checking: query.isFetching,
        checkAgain: () => {
            void query.refetch()
        }
    }
}
