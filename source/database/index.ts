import { drizzle, type NodePgQueryResultHKT } from "drizzle-orm/node-postgres"
import type { PgDatabase } from "drizzle-orm/pg-core"
import pg from "pg"
import { localDatabaseUrl } from "./local"
import * as schema from "./schema"

// Connections the server keeps open, of the 500 Railway's Postgres allows
// (`max_connections`, read on 2026-10-25). With DBOS's own
// (backend/workflows/engine.ts, which has the sum), one process holds at
// most 23, and the two that run while a deploy goes out 46, which leaves
// room for the migrations and psql.
const POOL_SIZE = 10

/**
 * A pool of connections to the database at `url`, through Drizzle. Each
 * query borrows a connection and hands it back, so make one pool per
 * process (`appDatabase()`, for the server) and close it with
 * `.$client.end()` when the process is done with it.
 */
export function connect(url: string, size = POOL_SIZE) {
    const pool = new pg.Pool({ connectionString: url, max: size })
    // A connection that drops while it sits in the pool, like when the
    // database restarts, is reported here, where it would otherwise crash
    // the process. The pool replaces it.
    pool.on("error", (error) => {
        console.error("Idle database connection failed", { error })
    })
    return drizzle(pool, { schema })
}

/**
 * The database, or a transaction in it (`database.transaction()`): what
 * every query is written against. Statements that must land together go in
 * one transaction, and a function that runs inside one takes its `transaction` as
 * this, since a query on the pool would run outside it.
 */
export type Database = PgDatabase<NodePgQueryResultHKT, typeof schema>

let shared: ReturnType<typeof connect> | undefined

/**
 * The server's database's URL: `DATABASE_URL`, which Railway sets, or this
 * checkout's own in a dev server (./local), whatever `DATABASE_URL` says
 * there.
 */
export function appDatabaseUrl() {
    const url = import.meta.env.DEV
        ? localDatabaseUrl()
        : process.env.DATABASE_URL
    if (url === undefined) {
        throw new Error("DATABASE_URL isn't set")
    } else {
        return url
    }
}

/**
 * The server's database (`appDatabaseUrl()`), connected the first time it's
 * asked for.
 */
export function appDatabase() {
    if (shared === undefined) {
        shared = connect(appDatabaseUrl())
    }
    return shared
}
