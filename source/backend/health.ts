import { sql } from "drizzle-orm"
import { Hono } from "hono"
import type { ApiEnvironment } from "./context"

// Whether the server can reach the database: Railway's healthcheck, which a
// new deployment has to pass before it takes traffic (.railway/railway.ts),
// and the home page's status line
export const healthRoutes = new Hono<ApiEnvironment>().get(
    "/health",
    async (context) => {
        try {
            await context.var.database.execute(sql`select 1`)
            return context.json({ ok: true })
        } catch (error) {
            console.error("Database health check failed", { error })
            return context.json({ ok: false }, 503)
        }
    }
)
