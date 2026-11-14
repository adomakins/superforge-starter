import { type QueryClient, QueryClientProvider } from "@tanstack/react-query"
import {
    createRootRouteWithContext,
    HeadContent,
    Outlet,
    Scripts
} from "@tanstack/react-router"
import type { ReactNode } from "react"
import appCss from "@/frontend/styles.css?url"

export const Route = createRootRouteWithContext<{
    queryClient: QueryClient
}>()({
    head: () => ({
        meta: [
            { charSet: "utf-8" },
            {
                name: "viewport",
                content: "width=device-width, initial-scale=1"
            },
            // The business's name and what it does, set by START-HERE.md
            { title: "Your business, in one codebase" },
            {
                name: "description",
                content:
                    "A website, an API and a database in one codebase, made to be changed with Claude."
            }
        ],
        links: [
            { rel: "stylesheet", href: appCss },
            { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" }
        ]
    }),
    shellComponent: RootDocument,
    component: Root
})

// Every page's queries share the router's query cache (router.tsx)
function Root() {
    const { queryClient } = Route.useRouteContext()
    return (
        <QueryClientProvider client={queryClient}>
            <Outlet />
        </QueryClientProvider>
    )
}

function RootDocument({ children }: { children: ReactNode }) {
    return (
        <html lang="en">
            <head>
                <HeadContent />
            </head>
            <body className="min-h-screen antialiased">
                {children}
                <Scripts />
            </body>
        </html>
    )
}
