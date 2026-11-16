import { type Context, Hono } from "hono"
import { csrf } from "hono/csrf"
import { appDatabase } from "@/database"
import { appStorage } from "@/database/storage"
import { authRoutes } from "./auth/routes"
import type { ApiEnvironment } from "./context"
import { answerNotFound, answerUnexpected } from "./failures"
import { healthRoutes } from "./health/routes"
import { appInfra } from "./infra"
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
            // Storage bucket on `context.var.storage`, the workflows'
            // starter on `context.var.workflows`, and Infra on
            // `context.var.infra`. Nothing under /api is kept in Railway's
            // cache (source/node.ts), so each request reaches the server.
            .use(async (context, next) => {
                const { database, storage, workflows, infra } = variables()
                context.set("database", database)
                context.set("storage", storage)
                context.set("workflows", workflows)
                context.set("infra", infra)
                await next()
                context.header("Cache-Control", "no-store")
            })

            // A form on another site can post to any address, with the
            // visitor's cookies when it's a top-level navigation: refuse
            // the kinds of body a form sends (403, failures.ts) unless the
            // browser says the request came from this site. JSON, which a
            // form can't send, is left alone, and so is a request that says
            // nothing of its body, like a script's bodiless POST, since a
            // form always says.
            .use((context, next) =>
                context.req.header("Content-Type") === undefined
                    ? next()
                    : refuseCrossSiteForms(context, next)
            )

            // Every failure in the one shape (failures.ts): a path no route
            // answers, and a route that threw
            .notFound(answerNotFound)
            .onError(answerUnexpected)

            // Whether the server can reach its database
            .route("/", healthRoutes)

            // Signing in, through Infra, and out, under /auth
            .route("/", authRoutes)
    )
}

const refuseCrossSiteForms = csrf({ origin: fromThisHost })

// Whether a request's Origin is this site: by its host alone, since behind
// Railway's proxy the request's own address says http, and the browser's
// https
function fromThisHost(origin: string, context: Context) {
    return (
        URL.canParse(origin) &&
        new URL(origin).host === new URL(context.req.url).host
    )
}

/** The server's API, on its database, bucket, workflows and Infra. */
export const api = apiWith(() => ({
    database: appDatabase(),
    storage: appStorage(),
    workflows: dbosWorkflows,
    infra: appInfra()
}))

export type AppType = typeof api
