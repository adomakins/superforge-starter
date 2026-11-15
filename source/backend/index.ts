import { Hono } from "hono"
import { appDatabase } from "@/database"
import { appStorage } from "@/database/storage"
import type { ApiEnvironment } from "./context"
import { healthRoutes } from "./health"

// The API, under /api. Each group of routes is a Hono app of its own, in a
// file named for what it's about, mounted here, so a test can mount it on
// an app that puts its own database and storage on its `context` (backend/tests/).
export const api = new Hono<ApiEnvironment>()
    .basePath("/api")

    // The database, on `context.var.database` for every route, and the
    // Storage bucket on `context.var.storage`. Nothing under /api is kept in Railway's
    // cache (source/node.ts), so each request reaches the server.
    .use(async (context, next) => {
        context.set("database", appDatabase())
        context.set("storage", appStorage())
        await next()
        context.header("Cache-Control", "no-store")
    })

    .route("/", healthRoutes)

export type AppType = typeof api
