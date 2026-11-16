import { serve } from "@hono/node-server"
import { serveStatic } from "@hono/node-server/serve-static"
import { Hono } from "hono"

/**
 * The Node server Railway runs, `pnpm start` after `pnpm build`. The client
 * build's files come first, every prerendered page among them. Every other
 * request goes to source/server.ts, as Start built it.
 *
 * Node runs this file from source, stripping its types, so it imports only
 * packages and the build: no `@/` paths, nothing else from source/.
 */

type ServerEntry = { fetch(request: Request): Promise<Response> }

// A path, not a specifier, so tsc doesn't look for a build that typecheck
// runs before. Beside Start's entry, the workflows' start and stop
// (source/server.ts).
const built: {
    default: ServerEntry
    startWorkflows(): Promise<void>
    stopWorkflows(): Promise<void>
} = await import(new URL("../output/server/server.js", import.meta.url).href)

/**
 * What browsers and Railway's CDN may keep of the build's files
 * (.railway/railway.ts, `cdn`; workbench/commit-and-deploy.md, "Caching").
 * The build names everything under /assets by its content, so both keep
 * those for good. The rest, the prerendered pages among them, a browser
 * asks for again on each visit (`max-age=0`), so it never holds a page that
 * points at /assets a deploy has replaced, while the edge keeps them
 * (`s-maxage`): a page for a day, or until the next deploy, which purges
 * every page from the edge, and anything else, like the favicon, for an
 * hour, since a deploy leaves those. A day, not a year, so a purge that
 * misses can't leave an old page at the edge for long.
 */
function cacheControl(request_path: string, file: string) {
    if (request_path.startsWith("/assets/")) {
        return "public, max-age=31536000, immutable"
    } else if (file.endsWith(".html")) {
        return "public, max-age=0, s-maxage=86400"
    } else {
        return "public, max-age=0, s-maxage=3600"
    }
}

const app = new Hono()
    // Relative to where `pnpm start` runs: the repository's root
    .use(
        serveStatic({
            root: "output/client",
            onFound: (file, context) => {
                context.header(
                    "Cache-Control",
                    cacheControl(context.req.path, file)
                )
            }
        })
    )
    // Anything rendered on request (the API, a 404) stays out of the edge's
    // cache unless it says otherwise
    .all("*", async (context) => {
        const response = await built.default.fetch(context.req.raw)
        if (!response.headers.has("Cache-Control")) {
            const headers = new Headers(response.headers)
            headers.set("Cache-Control", "no-store")
            return new Response(response.body, {
                status: response.status,
                statusText: response.statusText,
                headers
            })
        } else {
            return response
        }
    })

const server = serve(
    { fetch: app.fetch, port: Number(process.env.PORT ?? 3000) },
    (address) => console.info("Server listening", { port: address.port })
)

// The workflows, once the server is answering: while a deploy goes out they
// wait for the old deployment's gate, and the healthcheck has to answer
// meanwhile for Railway to stop the old one (source/backend/workflows/)
built.startWorkflows()

// Railway stops the old deployment with SIGTERM once a new one is healthy:
// stop the workflows first, which lets the new one's start, then finish the
// requests in flight, and exit. Once, however many signals come: pnpm
// passes its own on, so a signal to both is two here, and a second stop
// mustn't exit while the first is still shutting DBOS down.
let stopping = false
process.on("SIGTERM", async () => {
    if (stopping) {
        return
    }
    stopping = true
    console.info("Server stopping")
    try {
        await built.stopWorkflows()
    } catch (error) {
        console.error("The workflows didn't stop cleanly", { error })
    }
    server.close(() => process.exit(0))
})
