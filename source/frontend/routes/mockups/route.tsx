import { createFileRoute, Outlet } from "@tanstack/react-router"
import { cn } from "cn"
import { z } from "zod"
import { MockupBar } from "@/frontend/components/mockups/mockup-bar"
import {
    SAMPLE_THEMES,
    THEMES
} from "@/frontend/components/mockups/sample-themes"

// Mockups of the home page, three directions for it, for the dev server.
// A build prerenders them too, since Start's prerender writes every route
// without parameters, linked or not: they go before anything merges.
const mockup_search = z.object({
    theme: z.enum(THEMES).optional().catch(undefined)
})

export const Route = createFileRoute("/mockups")({
    validateSearch: mockup_search,
    component: Mockups
})

function Mockups() {
    const { theme = "template" } = Route.useSearch()
    return (
        <>
            <style>{SAMPLE_THEMES}</style>
            <div
                className={cn(
                    "min-h-dvh bg-background pb-24 text-foreground selection:bg-primary/15",
                    theme === "rounded" && "theme-rounded",
                    theme === "sharp" && "theme-sharp"
                )}
            >
                <Outlet />
            </div>
            <MockupBar />
        </>
    )
}
