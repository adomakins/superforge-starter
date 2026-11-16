import { cn } from "cn"
import { useSyncExternalStore } from "react"

/**
 * Whether this is the dev server (`pnpm dev`) or a build. Vite sets it in
 * both the prerender and the browser's bundle, so the two agree.
 */
export const IN_DEVELOPMENT = import.meta.env.DEV

function subscribeToNothing() {
    return () => {}
}

/**
 * The address the page was opened at, like `localhost:3000`, once it's in the
 * browser. The prerender has no address, so it's null there and on the first
 * render after it, and the page fills it in without a mismatch.
 */
export function useAddress(): string | null {
    return useSyncExternalStore(
        subscribeToNothing,
        () => window.location.host,
        () => null
    )
}

/** Where this copy is running: on this computer, or online. */
export function EnvironmentChip({ className }: { className?: string }) {
    const address = useAddress()
    return (
        <p
            className={cn(
                "flex min-w-0 items-center gap-2 text-muted-foreground text-xs",
                className
            )}
        >
            <span className="shrink-0">
                {IN_DEVELOPMENT ? "On your computer" : "Online"}
            </span>
            {address !== null && (
                <span className="truncate font-mono text-foreground/80">
                    {address}
                </span>
            )}
        </p>
    )
}

/** The placeholder mark and name, which START-HERE.md replaces. */
export function BusinessMark() {
    return (
        <span className="flex items-center gap-2.5">
            {/* The favicon, which follows the device's theme itself */}
            <img src="/favicon.svg" alt="" className="size-5" />
            <span className="font-medium text-sm">Your business</span>
        </span>
    )
}
