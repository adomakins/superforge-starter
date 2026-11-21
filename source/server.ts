import start, { createServerEntry } from "@tanstack/react-start/server-entry"
import { api } from "./backend"
import { oauth } from "./backend/agents/oauth"
import { mcp } from "./backend/mcp"
import { syncAppInternalUsers } from "./backend/users/sync"
import { startWorkflows } from "./backend/workflows/engine"

// What the Node server runs once it's listening (source/node.ts): the
// internal users made to follow the list in backend/auth/access.ts
// (backend/users/sync.ts), and the workflows' start, with their stop as
// Railway stops the deployment (backend/workflows/engine.ts)
export { syncAppInternalUsers } from "./backend/users/sync"
export { startWorkflows, stopWorkflows } from "./backend/workflows/engine"

// A dev server does both as it first loads this, once for its life,
// however many times it loads it again. The build's prerender loads it
// too, and never does, and the tests never load it.
if (import.meta.env.DEV) {
    syncAppInternalUsers()
    startWorkflows()
}

// The client build's files, every prerendered page among them, never reach
// this: the Node server answers them first (source/node.ts), and so does
// Vite's dev server. So this sees /api, the app's own MCP (/mcp,
// backend/mcp/) and where Claude signs in to it (/.well-known/oauth-* and
// /oauth/*, backend/agents/oauth.ts), and anything that isn't a page (a
// 404).
export default createServerEntry({
    fetch(request) {
        const { pathname } = new URL(request.url)
        if (pathname.startsWith("/api/")) {
            return api.fetch(request)
        } else if (pathname === "/mcp") {
            return mcp.fetch(request)
        } else if (
            pathname.startsWith("/oauth/") ||
            pathname.startsWith("/.well-known/oauth-")
        ) {
            return oauth.fetch(request)
        } else {
            return start.fetch(request)
        }
    }
})
