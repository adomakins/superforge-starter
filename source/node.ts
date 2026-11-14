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
// runs before
const built: { default: ServerEntry } = await import(
    new URL("../output/server/server.js", import.meta.url).href
)

/**
 * What browsers and Railway's CDN may keep of the build's files
 * (.railway/railway.ts, `cdn`; workbench/commit-and-deploy.md, "Caching").
 * The build names everything under /assets by its content, so both keep
 * those for good. The rest, the prerendered pages among them, a browser
 * asks for again on each visit (`max-age=0`), so it never holds a page that
 * points at /assets a deploy has replaced, while the edge keeps them
 * (`s-maxage`): a page until the next deploy, which purges every page from
 * the edge, and anything else, like the favicon, for an hour, since a
 * deploy leaves those.
 */
function cacheControl(request_path: string, file: string) {
    if (request_path.startsWith("/assets/")) {
        return "public, max-age=31536000, immutable"
    } else if (file.endsWith(".html")) {
        return "public, max-age=0, s-maxage=31536000"
    } else {
        return "public, max-age=0, s-maxage=3600"
    }
}

const app = new Hono()
    // Relative to where `pnpm start` runs: the repository's root
    .use(
        serveStatic({
            root: "output/client",
            onFound: (file, c) => {
                c.header("Cache-Control", cacheControl(c.req.path, file))
            }
        })
    )
    // Anything rendered on request (the API, a 404) stays out of the edge's
    // cache unless it says otherwise
    .all("*", async (c) => {
        const response = await built.default.fetch(c.req.raw)
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

// Railway stops the old deployment with SIGTERM once a new one is healthy:
// finish the requests in flight, then exit
process.on("SIGTERM", () => {
    console.info("Server stopping")
    server.close(() => process.exit(0))
})
