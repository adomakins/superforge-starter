import { createFileRoute, Outlet } from "@tanstack/react-router"
import { cn } from "cn"
import { z } from "zod"
import { MockupBar } from "@/frontend/components/mockups/mockup-bar"
import {
    SAMPLE_THEMES,
    THEMES
} from "@/frontend/components/mockups/sample-themes"

// Mockups of the dashboard, three directions for it, for the dev server:
// who's viewing (one of the business's own, or a customer) and which theme
// it's drawn in are in the address, so a link shows the same thing. They go
// before anything merges, and the chosen direction becomes routes/dashboard/.
const mockup_search = z.object({
    theme: z.enum(THEMES).optional().catch(undefined),
    as: z.enum(["internal", "customer"]).optional().catch(undefined)
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
                    "min-h-dvh bg-background pb-20 text-foreground selection:bg-primary/15",
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
