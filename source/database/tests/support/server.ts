import pg from "pg"
import { localDatabaseUrl } from "../../local"

// The Postgres server the tests make their databases on: this checkout's
// own (source/database/local/), which setup.ts starts, here and in CI alike.

/** The URL of a database on it. */
export function databaseUrl(name: string) {
    return localDatabaseUrl(name)
}

/**
 * Runs `work` on a connection to the server's own database, for what can't
 * run inside the database it changes: creating and dropping databases.
 */
export async function onServer<Result>(
    work: (client: pg.Client) => Promise<Result>
) {
    const client = new pg.Client({ connectionString: databaseUrl("postgres") })
    await client.connect()
    try {
        return await work(client)
    } finally {
        await client.end()
    }
}

/** A database's name, quoted for SQL. Only ever one the tests made. */
export function quoted(name: string) {
    if (!/^[a-z0-9_]+$/.test(name)) {
        throw new Error(`Not a test database's name: ${name}`)
    }
    return `"${name}"`
}
