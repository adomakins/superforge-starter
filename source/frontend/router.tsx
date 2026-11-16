import { QueryClient } from "@tanstack/react-query"
import { createRouter as createTanStackRouter } from "@tanstack/react-router"
import { NotFound } from "@/frontend/components/states/not-found"
import { routeTree } from "./routeTree.gen"

export function getRouter() {
    return createTanStackRouter({
        routeTree,
        // One query cache per router: per request on the server (the
        // prerender), once for the life of the page in the browser. It's on
        // the context so a route's loader can read it; `__root.tsx`
        // provides it to components.
        context: { queryClient: new QueryClient() },
        scrollRestoration: true,
        defaultPreload: "intent",
        defaultNotFoundComponent: NotFound
    })
}

declare module "@tanstack/react-router" {
    interface Register {
        router: ReturnType<typeof getRouter>
    }
}
