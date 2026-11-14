import { Hono } from "hono"
import { testClient } from "hono/testing"
import { expect, test } from "vitest"
import type { ApiEnv } from "@/backend/context"
import { healthRoutes } from "@/backend/health"
import { testDatabase } from "@/database/tests/support/database"

// The health check, on a database of the test's own, the way a route is
// tested: an app of the test's own puts what the route reads on `c`, then
// mounts the route's group

test("GET /api/health answers once the database does", async () => {
    const database = await testDatabase()
    const app = new Hono<ApiEnv>()
        .use(async (c, next) => {
            c.set("database", database)
            await next()
        })
        .route("/", healthRoutes)
    const response = await testClient(app).health.$get()
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })
})
