import { hc } from "hono/client"
import type { AppType } from "./index"

/**
 * Typed client for the Hono API, used by the frontend. Same origin, so no
 * base URL. This is the one file in `backend/` the browser may import: it
 * only takes the API's types from `./index`, so no server code comes with it.
 */
export const client = hc<AppType>("/")
