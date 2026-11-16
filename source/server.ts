import start, { createServerEntry } from "@tanstack/react-start/server-entry"
import { api } from "./backend"
import { startWorkflows } from "./backend/workflows/engine"

// The workflows' start and stop (backend/workflows/engine.ts), for the Node
// server, which starts them once it's listening and stops them as Railway
// stops the deployment (source/node.ts)
export { startWorkflows, stopWorkflows } from "./backend/workflows/engine"

// A dev server starts the workflows as it first loads this, once for its
// life, however many times it loads it again. The build's prerender loads
// it too, and never starts them, and the tests never load it.
if (import.meta.env.DEV) {
    startWorkflows()
}

// The client build's files, every prerendered page among them, never reach
// this: the Node server answers them first (source/node.ts), and so does
// Vite's dev server. So this sees /api, and anything that isn't a page (a
// 404).
export default createServerEntry({
    fetch(request) {
        const { pathname } = new URL(request.url)
        if (pathname.startsWith("/api/")) {
            return api.fetch(request)
        } else {
            return start.fetch(request)
        }
    }
})
