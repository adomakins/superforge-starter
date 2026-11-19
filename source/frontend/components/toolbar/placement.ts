import {
    type KeyboardEvent,
    type PointerEvent,
    type RefObject,
    useRef,
    useState
} from "react"
import { flushSync } from "react-dom"
import {
    type Direction,
    keepPin,
    nearestPin,
    pinToward,
    readPin,
    type ToolbarPin
} from "./pins"

// Moving the toolbar: dragged by its handle, it follows the pointer, and
// let go, it glides to the nearest pin (pins.ts); the arrow keys on the
// handle move it a pin at a time. Each pin is a place in CSS, so a pinned
// toolbar stays put as the window resizes.

// Each pin as Tailwind's classes, clear of a phone's notch and home bar
const BOTTOM = "bottom-[max(1rem,env(safe-area-inset-bottom))]"
const TOP = "top-[max(1rem,env(safe-area-inset-top))]"
const LEFT = "left-[max(1rem,env(safe-area-inset-left))]"
const RIGHT = "right-[max(1rem,env(safe-area-inset-right))]"
const PLACES: Record<ToolbarPin, string> = {
    "bottom-center": `${BOTTOM} left-1/2`,
    "bottom-left": `${BOTTOM} ${LEFT}`,
    "bottom-right": `${BOTTOM} ${RIGHT}`,
    "top-left": `${TOP} ${LEFT}`,
    "top-right": `${TOP} ${RIGHT}`
}

// The arrow keys the handle takes, and which way each moves it
const ARROWS = new Map<string, Direction>([
    ["ArrowLeft", "left"],
    ["ArrowRight", "right"],
    ["ArrowUp", "up"],
    ["ArrowDown", "down"]
])

// How the toolbar glides to its pin
const GLIDE = "transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1)"

type Point = { x: number; y: number }

/**
 * Where the toolbar `pill` is, and the handlers its handle takes: `place`
 * is its pin's classes and `transform` its inline transform, which follows
 * the pointer while it's dragged.
 */
export function usePlacement(pill: RefObject<HTMLElement | null>) {
    const [pin, setPin] = useState<ToolbarPin>(readPin)
    const [drag, setDrag] = useState<Point | null>(null)
    const start = useRef<Point | null>(null)

    // The middle pin is centered by its own half width
    const settled = pin === "bottom-center" ? "translateX(-50%)" : "none"

    // Pins the toolbar at `next`, gliding there from where it was, `first`
    function settle(next: ToolbarPin, first: DOMRect) {
        const element = pill.current
        flushSync(() => {
            setDrag(null)
            setPin(next)
        })
        keepPin(next)
        if (element !== null) {
            glide(element, first)
        }
    }

    // Drops the toolbar where it's been dragged, at the nearest pin
    function dropped() {
        const element = pill.current
        if (start.current === null || element === null) {
            return
        }
        start.current = null
        const rect = element.getBoundingClientRect()
        settle(
            nearestPin(
                {
                    x: rect.left + rect.width / 2,
                    y: rect.top + rect.height / 2
                },
                rect,
                { width: window.innerWidth, height: window.innerHeight }
            ),
            rect
        )
    }

    const handle = {
        onPointerDown(event: PointerEvent<HTMLElement>) {
            if (event.button !== 0) {
                return
            }
            // Not a text selection, nor the handle taking focus
            event.preventDefault()
            event.currentTarget.setPointerCapture(event.pointerId)
            if (pill.current !== null) {
                pill.current.style.transition = ""
            }
            start.current = { x: event.clientX, y: event.clientY }
            setDrag({ x: 0, y: 0 })
        },
        onPointerMove(event: PointerEvent<HTMLElement>) {
            const from = start.current
            if (from !== null) {
                setDrag({
                    x: event.clientX - from.x,
                    y: event.clientY - from.y
                })
            }
        },
        onPointerUp: dropped,
        onPointerCancel: dropped,
        onKeyDown(event: KeyboardEvent<HTMLElement>) {
            const direction = ARROWS.get(event.key)
            const element = pill.current
            if (direction === undefined || element === null) {
                return
            }
            event.preventDefault()
            settle(pinToward(pin, direction), element.getBoundingClientRect())
        }
    }

    return {
        pin,
        dragging: drag !== null,
        place: PLACES[pin],
        transform:
            drag === null
                ? settled
                : `${settled === "none" ? "" : settled} translate(${drag.x}px, ${drag.y}px)`,
        handle
    }
}

// Glides `element` from `first`, where it was, to where it is now, unless
// the device asks for less motion
function glide(element: HTMLElement, first: DOMRect) {
    const last = element.getBoundingClientRect()
    const x = first.left - last.left
    const y = first.top - last.top
    if (
        (x === 0 && y === 0) ||
        window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
        return
    }
    const settled = element.style.transform
    element.style.transition = "none"
    element.style.transform = `${settled === "none" ? "" : settled} translate(${x}px, ${y}px)`
    // Laid out where it was before it's let go, so it glides from there
    element.getBoundingClientRect()
    element.style.transition = GLIDE
    element.style.transform = settled
}
