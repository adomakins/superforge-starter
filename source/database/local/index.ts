import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

// This checkout's own Postgres, which `pnpm dev`, the tests and the
// `database:*` scripts use, and server.ts starts: a Postgres 18 from npm
// (`embedded-postgres`'s binaries) rather than one in Docker, so
// `pnpm install` is the whole setup, the same on a laptop, in CI and in a
// cloud agent. Each checkout has its own, on a port of its own, so
// worktrees never share a database.
//
// Node runs server.ts from source, and it imports this, so this imports
// only Node's own modules: no `@/` paths, and no `import.meta.env`.

/** The app's database on it. The tests make theirs beside it. */
export const LOCAL_DATABASE = "app"

/**
 * Where this checkout's Postgres keeps its data, its port and its log:
 * `.postgres/` in the checkout, which git ignores. Postgres refuses to run
 * as root, so as root, as a cloud sandbox's shell may be, it runs as a user
 * of its own (server.ts), which may not be able to reach the checkout: then
 * it's in the system's temporary folder, named for the checkout.
 */
export function localDirectory() {
    const checkout = process.cwd()
    if (process.getuid?.() === 0) {
        const name = createHash("sha256")
            .update(checkout)
            .digest("hex")
            .slice(0, 12)
        return join(tmpdir(), `app-postgres-${name}`)
    } else {
        return join(checkout, ".postgres")
    }
}

/** The file that holds the port this checkout's Postgres listens on. */
export function portFile() {
    return join(localDirectory(), "port")
}

/**
 * The URL of a database on this checkout's Postgres: the app's unless
 * another is named. `pnpm dev` and the tests start it first.
 */
export function localDatabaseUrl(database = LOCAL_DATABASE) {
    const port = (() => {
        try {
            return readFileSync(portFile(), "utf8").trim()
        } catch (error) {
            throw new Error(
                "This checkout's Postgres has never started: `pnpm dev` or `pnpm test` starts it",
                { cause: error }
            )
        }
    })()
    return `postgres://postgres@127.0.0.1:${port}/${database}`
}
