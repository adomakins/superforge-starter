import { type QueryClient, QueryClientProvider } from "@tanstack/react-query"
import {
    createRootRouteWithContext,
    HeadContent,
    Outlet,
    Scripts,
    useRouter
} from "@tanstack/react-router"
import { type ReactNode, useEffect } from "react"
import { ConsentBanner } from "@/frontend/components/site/consent-banner"
import appCss from "@/frontend/styles.css?url"
import { startVisitors } from "@/frontend/visitors"

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

// Every page's queries share the router's query cache (router.tsx). Every
// page records what its visitors view, click and run into, for the owner's
// dashboard on Superforge Infra, from an effect, so only ever in the
// browser, and asks first, in the banner (frontend/visitors/).
function Root() {
    const { queryClient } = Route.useRouteContext()
    const router = useRouter()
    useEffect(() => startVisitors(router), [router])
    return (
        <QueryClientProvider client={queryClient}>
            <Outlet />
            <ConsentBanner />
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
