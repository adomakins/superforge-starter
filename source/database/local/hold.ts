import pg from "pg"
import type { Plugin, ViteDevServer } from "vite"
import { localDatabaseUrl } from "./index.ts"

/**
 * A Vite plugin that holds one connection to this checkout's Postgres for
 * as long as the dev server runs, so the server's idle watch (idle.ts)
 * never stops it under one. Without it, a dev server nobody has opened yet
 * holds none: Start loads source/server.ts, which is what connects, on the
 * first request.
 */
export function holdLocalDatabase(): Plugin {
    return {
        name: "app:hold-local-database",
        apply: "serve",
        configureServer(server) {
            // In middleware mode there's no dev server of its own to hold it
            // for
            if (server.httpServer === null) {
                return
            }
            try {
                hold(localDatabaseUrl("postgres"), server.httpServer)
            } catch (error) {
                console.error(
                    "The dev server couldn't hold this checkout's Postgres",
                    { error }
                )
            }
        }
    }
}

// Connects, and lets go once the dev server closes
function hold(url: string, http: NonNullable<ViteDevServer["httpServer"]>) {
    const client = new pg.Client({
        connectionString: url,
        application_name: "app dev server"
    })
    client.on("error", (error) => {
        console.error(
            "The dev server lost its connection to this checkout's Postgres",
            { error }
        )
    })
    client.connect().catch((error: unknown) => {
        console.error(
            "The dev server couldn't connect to this checkout's Postgres",
            { error }
        )
    })
    http.once("close", () => {
        client.end().catch((error: unknown) => {
            console.error(
                "The dev server's connection to this checkout's Postgres didn't close",
                { error }
            )
        })
    })
}
