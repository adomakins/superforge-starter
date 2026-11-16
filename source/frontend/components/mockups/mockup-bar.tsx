import { Link, useLocation, useSearch } from "@tanstack/react-router"
import { cn } from "cn"
import { THEME_NAMES, THEMES } from "./sample-themes"

const DIRECTIONS = [
    { to: "/mockups/rail", letter: "A", name: "Rail" },
    { to: "/mockups/timeline", letter: "B", name: "Timeline" },
    { to: "/mockups/inspector", letter: "C", name: "Inspector" }
] as const

const VIEWERS = [
    { as: "internal", name: "Internal" },
    { as: "customer", name: "Customer" }
] as const

const SEGMENT =
    "rounded-md px-2 py-1 text-background/70 transition-colors hover:bg-background/10 hover:text-background aria-[current=page]:bg-background aria-[current=page]:text-foreground aria-[current=true]:bg-background aria-[current=true]:text-foreground"

/**
 * The mockups' own controls, not part of any design: which direction, who's
 * viewing it, and which theme it's drawn in. It sits outside the themed
 * page, so it looks the same whichever theme is on.
 */
export function MockupBar() {
    const { pathname } = useLocation()
    const { theme = "template", as = "internal" } = useSearch({
        from: "/mockups"
    })
    return (
        <nav
            aria-label="Mockups"
            className="fixed inset-x-3 bottom-3 z-50 mx-auto flex w-fit max-w-[calc(100%-1.5rem)] flex-wrap items-center justify-center gap-x-3 gap-y-1.5 rounded-xl bg-foreground px-2 py-1.5 text-background text-xs shadow-black/20 shadow-lg"
        >
            <div className="flex items-center gap-0.5">
                <Link
                    to="/mockups"
                    search={(previous) => previous}
                    activeOptions={{ exact: true }}
                    className={SEGMENT}
                >
                    Notes
                </Link>
                {DIRECTIONS.map((direction) => (
                    <Link
                        key={direction.to}
                        to={direction.to}
                        search={(previous) => ({
                            theme: previous.theme,
                            as: previous.as
                        })}
                        className={SEGMENT}
                    >
                        <span className="font-medium">{direction.letter}</span>{" "}
                        {direction.name}
                    </Link>
                ))}
            </div>
            <div className="flex items-center gap-0.5">
                {VIEWERS.map((viewer) => (
                    <Link
                        key={viewer.as}
                        to={pathname}
                        search={(previous) => ({
                            theme: previous.theme,
                            as: viewer.as
                        })}
                        aria-current={viewer.as === as ? "true" : undefined}
                        className={SEGMENT}
                    >
                        {viewer.name}
                    </Link>
                ))}
            </div>
            <div className="flex items-center gap-0.5">
                {THEMES.map((each) => (
                    <Link
                        key={each}
                        to={pathname}
                        search={(previous) => ({ ...previous, theme: each })}
                        aria-current={each === theme ? "true" : undefined}
                        className={cn(SEGMENT, "whitespace-nowrap")}
                    >
                        {THEME_NAMES[each]}
                    </Link>
                ))}
            </div>
        </nav>
    )
}
