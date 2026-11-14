import start, { createServerEntry } from "@tanstack/react-start/server-entry"
import { api } from "./backend"

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
