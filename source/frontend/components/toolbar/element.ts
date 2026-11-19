import { FIELDS } from "@/frontend/visitors/browser"
import type { ElementFacts, ElementStep } from "./describe"

// What the page says about an element someone clicked in the toolbar's
// comment mode, read off the page for describe.ts to turn into what a
// comment carries. Only ever runs in a browser, on a click.

/** What a click in comment mode lands on: the element, or the whole icon. */
export function commentTarget(target: EventTarget | null) {
    if (!(target instanceof Element)) {
        return null
    } else {
        // A part of an icon is too small to be what someone means
        return target.closest("svg") ?? target
    }
}

/** What the page says about `element`, for a comment on it. */
export function elementFacts(element: Element): ElementFacts {
    const rect = element.getBoundingClientRect()
    return {
        steps: stepsTo(element),
        label:
            element.getAttribute("aria-label") ??
            element.getAttribute("alt") ??
            element.getAttribute("title") ??
            element.getAttribute("placeholder"),
        // Its text, as written: hidden text too, which describe.ts trims
        text: element.textContent ?? "",
        classes: element.getAttribute("class"),
        private:
            element.matches(FIELDS) ||
            element.closest("[data-private]") !== null,
        box: {
            x: rect.left + window.scrollX,
            y: rect.top + window.scrollY,
            width: rect.width,
            height: rect.height
        }
    }
}

// From `element` up to the body's child: each one's tag, id, `data-track`
// and which of its kind it is
function stepsTo(element: Element) {
    const steps: ElementStep[] = []
    let current: Element | null = element
    while (
        current !== null &&
        current !== document.body &&
        current !== document.documentElement
    ) {
        const tag = current.tagName
        const parent: Element | null = current.parentElement
        const kind =
            parent === null
                ? [current]
                : [...parent.children].filter((child) => child.tagName === tag)
        steps.push({
            tag: tag.toLowerCase(),
            id: current.id === "" ? null : current.id,
            track: current.getAttribute("data-track"),
            position: kind.indexOf(current) + 1,
            siblings: kind.length
        })
        current = parent
    }
    return steps
}
