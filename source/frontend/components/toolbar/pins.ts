import { z } from "zod"

// Where the toolbar can sit: the middle of the bottom, or a corner. It's
// dragged by its handle and snaps to the nearest when it's let go, or
// moved with the arrow keys, and each browser keeps where it was put.
// Nothing here touches the page but `readPin` and `keepPin`, so the tests
// run the rest in Node.

/** The places the toolbar can be pinned, the first where it starts. */
export const TOOLBAR_PINS = [
    "bottom-center",
    "bottom-left",
    "bottom-right",
    "top-left",
    "top-right"
] as const
export const toolbar_pin = z.enum(TOOLBAR_PINS)
export type ToolbarPin = z.infer<typeof toolbar_pin>

/** Each pin in words, for a screen reader. */
export const PIN_NAMES: Record<ToolbarPin, string> = {
    "bottom-center": "bottom middle",
    "bottom-left": "bottom left",
    "bottom-right": "bottom right",
    "top-left": "top left",
    "top-right": "top right"
}

/** How far a pinned toolbar keeps from the window's edges, in CSS pixels. */
export const PIN_MARGIN = 16

type Size = { width: number; height: number }
type Point = { x: number; y: number }

/** Where the middle of a toolbar of `toolbar` size sits at `pin`. */
export function pinCenter(pin: ToolbarPin, toolbar: Size, window: Size): Point {
    const left = PIN_MARGIN + toolbar.width / 2
    const right = window.width - PIN_MARGIN - toolbar.width / 2
    const top = PIN_MARGIN + toolbar.height / 2
    const bottom = window.height - PIN_MARGIN - toolbar.height / 2
    if (pin === "bottom-center") {
        return { x: window.width / 2, y: bottom }
    } else if (pin === "bottom-left") {
        return { x: left, y: bottom }
    } else if (pin === "bottom-right") {
        return { x: right, y: bottom }
    } else if (pin === "top-left") {
        return { x: left, y: top }
    } else {
        return { x: right, y: top }
    }
}

/** The pin nearest a toolbar whose middle was let go at `center`. */
export function nearestPin(
    center: Point,
    toolbar: Size,
    window: Size
): ToolbarPin {
    let nearest: ToolbarPin = "bottom-center"
    let shortest = Number.POSITIVE_INFINITY
    for (const pin of TOOLBAR_PINS) {
        const at = pinCenter(pin, toolbar, window)
        const distance = Math.hypot(at.x - center.x, at.y - center.y)
        if (distance < shortest) {
            nearest = pin
            shortest = distance
        }
    }
    return nearest
}

/** An arrow key's direction, as the handle takes them. */
export type Direction = "left" | "right" | "up" | "down"

// The pins in a grid: two rows, three columns, with no top middle
const GRID: Record<"top" | "bottom", (ToolbarPin | null)[]> = {
    top: ["top-left", null, "top-right"],
    bottom: ["bottom-left", "bottom-center", "bottom-right"]
}

/**
 * The pin an arrow key moves the toolbar to from `pin`: along its row, or
 * to the other row in its column, skipping the top's missing middle. It
 * stays put where there's nothing that way.
 */
export function pinToward(pin: ToolbarPin, direction: Direction): ToolbarPin {
    const row = pin.startsWith("top") ? "top" : "bottom"
    const column = GRID[row].indexOf(pin)
    if (direction === "up" || direction === "down") {
        const other = direction === "up" ? "top" : "bottom"
        return GRID[other][column] ?? pin
    }
    const step = direction === "left" ? -1 : 1
    for (
        let next = column + step;
        next >= 0 && next < GRID[row].length;
        next += step
    ) {
        const found = GRID[row][next]
        if (found !== null && found !== undefined) {
            return found
        }
    }
    return pin
}

// Where this browser keeps the pin, in localStorage: a convenience, so a
// browser that won't keep it puts the toolbar where it starts
const STORED_PIN = "superforge-toolbar-pin"

/** Where this browser last put the toolbar, or where it starts. */
export function readPin(): ToolbarPin {
    try {
        const parsed = toolbar_pin.safeParse(localStorage.getItem(STORED_PIN))
        return parsed.success ? parsed.data : TOOLBAR_PINS[0]
    } catch (error) {
        console.debug("Toolbar: the pin couldn't be read", { error })
        return TOOLBAR_PINS[0]
    }
}

/** Keeps where the toolbar was put, for the next page this browser opens. */
export function keepPin(pin: ToolbarPin) {
    try {
        localStorage.setItem(STORED_PIN, pin)
    } catch (error) {
        console.debug("Toolbar: the pin couldn't be kept", { error })
    }
}
