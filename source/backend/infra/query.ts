// SQL over the project's own events, which Infra runs at /v1/query for the
// app's dashboards (README.md, "Query"): DuckDB's SQL, over two tables,
// `events`, every event the pages and the server sent, and `visits`, a
// visit a row with where it landed, where it came from and whether it
// bounced. Infra runs it in a database of the call's own, which holds only
// this project's events, so the app writes whatever SQL it likes.

/** A value a query's `$1` or `$name` stands for. */
export type QueryParameter = string | number | boolean | null

/** One query, and the values of its `$1`, `$2`… or `$name`s. */
export type InfraQuery = {
    sql: string
    params?: QueryParameter[] | Record<string, QueryParameter>
}

/**
 * What a call asks Infra: its queries by name, which share one read of
 * the events; how many days back to read, 90 at most; and the IANA time
 * zone its days count in, like `America/New_York`.
 */
export type QueryRequest = {
    queries: Record<string, InfraQuery>
    days: number
    time_zone: string
}
