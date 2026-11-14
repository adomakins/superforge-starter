import { sql } from "drizzle-orm"

// Times compared against stored timestamps come from the database's clock,
// so a comparison never mixes in the server's.

/** Now, by the database's clock: when the transaction started. */
export const now = sql`now()`

/** This many milliseconds from now, or before it when negative. */
export function fromNow(milliseconds: number) {
    return sql`(now() + make_interval(secs => ${milliseconds / 1000}))`
}
