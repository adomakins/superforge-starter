import { cn } from "cn"
import { useEffect, useRef, useState } from "react"
import { commentTarget } from "./element"

// Picking the element a comment is on, as a browser's inspector does: while
// it's on, the element under the pointer is outlined, and a click picks it
// rather than doing what it would. The toolbar itself, marked
// `data-toolbar`, works as ever.

// What a press on the page would set off: each is stopped before the
// page's own listeners hear it, a link's navigation and a button's action
// among them, and the visitors' click with them
const PRESSES = [
    "pointerdown",
    "mousedown",
    "pointerup",
    "mouseup",
    "click",
    "dblclick",
    "auxclick",
    "contextmenu"
] as const

/** Whether `target` is part of the toolbar, which picking leaves alone. */
export function inToolbar(target: EventTarget | null) {
    return (
        target instanceof Element && target.closest("[data-toolbar]") !== null
    )
}

/**
 * While `active`, outlines what's under the pointer and calls `onPick` with
 * what's clicked, and `onEscape` when Escape is pressed. Answers the
 * element under the pointer, or null.
 */
export function usePicker({
    active,
    onPick,
    onEscape
}: {
    active: boolean
    onPick: (element: Element) => void
    onEscape: () => void
}) {
    const [hovered, setHovered] = useState<Element | null>(null)
    // The latest handlers, so the listeners stay put while they change
    const handlers = useRef({ onPick, onEscape })
    handlers.current = { onPick, onEscape }

    useEffect(() => {
        if (!active) {
            setHovered(null)
            return
        }
        document.documentElement.setAttribute("data-picking", "")

        function moved(event: PointerEvent) {
            if (inToolbar(event.target)) {
                setHovered(null)
            } else {
                setHovered(commentTarget(event.target))
            }
        }
        function left(event: PointerEvent) {
            // Out of the window altogether
            if (event.relatedTarget === null) {
                setHovered(null)
            }
        }
        function pressed(event: Event) {
            if (inToolbar(event.target)) {
                return
            }
            event.preventDefault()
            event.stopImmediatePropagation()
            if (event.type === "click") {
                const target = commentTarget(event.target)
                if (target !== null) {
                    handlers.current.onPick(target)
                }
            }
        }
        function keyed(event: KeyboardEvent) {
            if (event.key === "Escape") {
                event.preventDefault()
                event.stopImmediatePropagation()
                handlers.current.onEscape()
            }
        }

        // On the window, as the event sets out, so before the page's own
        // listeners, the visitors' on the document among them
        const options = { capture: true }
        window.addEventListener("pointermove", moved, options)
        window.addEventListener("pointerout", left, options)
        window.addEventListener("keydown", keyed, options)
        for (const type of PRESSES) {
            window.addEventListener(type, pressed, options)
        }
        return () => {
            document.documentElement.removeAttribute("data-picking")
            window.removeEventListener("pointermove", moved, options)
            window.removeEventListener("pointerout", left, options)
            window.removeEventListener("keydown", keyed, options)
            for (const type of PRESSES) {
                window.removeEventListener(type, pressed, options)
            }
        }
    }, [active])

    return hovered
}

/** Where an element is in the window, in CSS pixels. */
export type Rect = { top: number; left: number; width: number; height: number }

/**
 * Where `element` is in the window, kept current each frame while it's
 * shown, as the page scrolls, resizes or moves it; null without one, or
 * once it's gone from the page.
 */
export function useRect(element: Element | null) {
    const [rect, setRect] = useState<Rect | null>(null)
    useEffect(() => {
        if (element === null) {
            setRect(null)
            return
        }
        let frame = 0
        let last = ""
        function measure() {
            if (element === null || !element.isConnected) {
                setRect(null)
            } else {
                const { top, left, width, height } =
                    element.getBoundingClientRect()
                const key = `${top},${left},${width},${height}`
                if (key !== last) {
                    last = key
                    setRect({ top, left, width, height })
                }
            }
            frame = requestAnimationFrame(measure)
        }
        measure()
        return () => cancelAnimationFrame(frame)
    }, [element])
    return rect
}

/**
 * The outline round an element, as a browser's inspector draws it, with
 * its tag and size: faint for the one under the pointer, firm for the one
 * picked. It never takes the pointer, so what's under it can be picked.
 */
export function Outline({
    element,
    picked = false
}: {
    element: Element | null
    picked?: boolean
}) {
    const rect = useRect(element)
    if (element === null || rect === null) {
        return null
    }
    const above = rect.top > 24
    return (
        <div
            aria-hidden
            data-toolbar
            className={cn(
                "pointer-events-none fixed z-[2147483645] rounded-[2px] border-2 border-highlight",
                picked ? "bg-highlight/10" : "bg-highlight/20 border-dashed"
            )}
            style={{
                top: rect.top,
                left: rect.left,
                width: rect.width,
                height: rect.height
            }}
        >
            <span
                className={cn(
                    "absolute left-[-2px] whitespace-nowrap rounded-sm bg-highlight px-1.5 py-0.5 font-mono text-[11px] leading-none text-highlight-foreground tabular-nums",
                    above ? "bottom-full mb-1" : "top-full mt-1"
                )}
            >
                {element.tagName.toLowerCase()} · {Math.round(rect.width)} ×{" "}
                {Math.round(rect.height)}
            </span>
        </div>
    )
}
