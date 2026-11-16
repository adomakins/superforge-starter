import { Hono } from "hono"
import { appDatabase } from "@/database"
import { appStorage } from "@/database/storage"
import type { ApiEnvironment } from "./context"
import { answerNotFound, answerUnexpected } from "./failures"
import { healthRoutes } from "./health/routes"
import { dbosWorkflows } from "./workflows/engine"

/**
 * The API under /api, with what every route sees on its `context`
 * (context.ts): the server's, below, or a test's own, with a database of
 * the test's (tests/support/api.ts). Each feature's routes are a Hono app of
 * their own, in its folder's `routes.ts`, mounted here.
 */
export function apiWith(variables: () => ApiEnvironment["Variables"]) {
    return (
        new Hono<ApiEnvironment>()
            .basePath("/api")

            // The database on `context.var.database` for every route, the
            // Storage bucket on `context.var.storage`, and the workflows'
            // starter on `context.var.workflows`. Nothing under /api is kept
            // in Railway's cache (source/node.ts), so each request reaches
            // the server.
            .use(async (context, next) => {
                const { database, storage, workflows } = variables()
                context.set("database", database)
                context.set("storage", storage)
                context.set("workflows", workflows)
                await next()
                context.header("Cache-Control", "no-store")
            })

            // Every failure in the one shape (failures.ts): a path no route
            // answers, and a route that threw
            .notFound(answerNotFound)
            .onError(answerUnexpected)

            // Whether the server can reach its database
            .route("/", healthRoutes)
    )
}

/** The server's API, on its database, bucket and workflows. */
export const api = apiWith(() => ({
    database: appDatabase(),
    storage: appStorage(),
    workflows: dbosWorkflows
}))

export type AppType = typeof api
