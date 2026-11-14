import { cn } from "cn"

// Ours, not shadcn's: one chip wherever a shortcut shows. Faint Gray on a
// plain surface. On a row that's highlighted, whose own fill is that same
// gray, it takes the page's color instead, with no ring: a sidebar link on
// hover or focus, a Jump to result, a menu item. Translucent in a tooltip.
const ON_A_HIGHLIGHTED_ROW =
    "group-hover/menu-button:bg-background group-focus-visible/menu-button:bg-background in-data-[selected=true]:bg-background in-data-highlighted:bg-background"

function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
    return (
        <kbd
            data-slot="kbd"
            className={cn(
                "pointer-events-none inline-flex h-5 w-fit min-w-5 items-center justify-center gap-1 rounded-sm bg-muted px-1 font-sans text-xs font-medium text-muted-foreground select-none in-data-[slot=tooltip-content]:bg-background/20 in-data-[slot=tooltip-content]:text-background dark:in-data-[slot=tooltip-content]:bg-background/10 [&_svg:not([class*='size-'])]:size-3",
                ON_A_HIGHLIGHTED_ROW,
                className
            )}
            {...props}
        />
    )
}

function KbdGroup({ className, ...props }: React.ComponentProps<"div">) {
    return (
        <kbd
            data-slot="kbd-group"
            className={cn("inline-flex items-center gap-1", className)}
            {...props}
        />
    )
}

/**
 * Ours: a shortcut as chips, the one way every screen shows one. Keys side
 * by side are a sequence (G then I) or a chord (⌘ K), always 2px apart:
 * close enough to read as one shortcut on any row, and the same on a
 * highlighted one, so nothing moves as the highlight does. Hidden from
 * screen readers, since what they belong to says what it does.
 */
function Keys({ keys, className }: { keys: string[]; className?: string }) {
    return (
        <KbdGroup
            aria-hidden
            className={cn("gap-0.5 tracking-normal", className)}
        >
            {keys.map((key, index) => (
                <Kbd key={`${index}-${key}`}>{key}</Kbd>
            ))}
        </KbdGroup>
    )
}

/**
 * Ours: a shortcut on a primary button, the one way any of them shows one:
 * light on the blue, and gone on a touch screen, with no keyboard to press
 * it on. On a button that hugs its words it goes right after them. A button
 * wider than that (which is `relative`) has it `pinned` to its end, so the
 * words stay centered, over whatever is centered under the button. Its place
 * is a square as tall as the button, so it sits as far from the end as from
 * the top and bottom, at any height.
 */
function ButtonKeys({
    keys,
    pinned = false
}: {
    keys: string[]
    pinned?: boolean
}) {
    return (
        <Keys
            keys={keys}
            className={cn(
                "pointer-coarse:hidden [&_kbd]:bg-primary-foreground/15 [&_kbd]:text-primary-foreground",
                pinned &&
                    "absolute inset-y-0 right-0 aspect-square justify-center"
            )}
        />
    )
}

export { ButtonKeys, Kbd, KbdGroup, Keys }
