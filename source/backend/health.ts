import { sql } from "drizzle-orm"
import { Hono } from "hono"
import type { ApiEnv } from "./context"

// Whether the server can reach the database: Railway's healthcheck, which a
// new deployment has to pass before it takes traffic (.railway/railway.ts),
// and the home page's status line
export const healthRoutes = new Hono<ApiEnv>().get("/health", async (c) => {
    try {
        await c.var.database.execute(sql`select 1`)
        return c.json({ ok: true })
    } catch (error) {
        console.error("Database health check failed", { error })
        return c.json({ ok: false }, 503)
    }
})
