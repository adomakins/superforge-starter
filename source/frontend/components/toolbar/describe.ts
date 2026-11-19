import { scrub } from "@/frontend/visitors/describe"
import type { CommentedElement } from "@/utilities/schemas/comments"

// What a comment says about the element it's on, from what the page says
// about it (element.ts): a selector that finds it again, the text it shows
// and its box. Nothing here touches the page, so the tests run it in Node.
// Text follows the visitors' rules (frontend/visitors/README.md): nothing
// shaped like an email address, no query in an address, and nothing at all
// from a field or from inside `data-private`.

/** The longest an element's text is kept. */
const LONGEST_TEXT = 300

/** The longest its selector and its classes can be, as Infra takes them. */
const LONGEST_SELECTOR = 1000
const LONGEST_CLASSES = 1000

/** The furthest a place on the page can be, in CSS pixels, as Infra takes it. */
const FURTHEST = 10_000_000

/** One element on the way from the one clicked up to the page's body. */
export type ElementStep = {
    // Its tag, lowercase
    tag: string
    // Its `id`, or null
    id: string | null
    // Its `data-track`, the name the app gave it, or null
    track: string | null
    // Which of its parent's children of the same tag it is, from 1, and
    // how many there are
    position: number
    siblings: number
}

/** What the page says about the element a comment is on (element.ts). */
export type ElementFacts = {
    // From the element itself up to the body's child, the body left out
    steps: ElementStep[]
    // Its `aria-label`, `alt`, `title` or `placeholder`: its name, when it
    // shows no text, like an icon's
    label: string | null
    // The text it shows
    text: string
    // Its `class` attribute
    classes: string | null
    // Whether it may show something private: it's a form's field, or
    // inside `data-private`, as the dashboard is
    private: boolean
    // Its box on the page, from the top of the document, in CSS pixels
    box: { x: number; y: number; width: number; height: number }
}

/** The element as a comment carries it to Infra. */
export function describeElement(facts: ElementFacts): CommentedElement {
    const [own] = facts.steps
    const text = scrub(facts.label ?? facts.text, LONGEST_TEXT)
    const classes = (facts.classes ?? "").replace(/\s+/g, " ").trim()
    return {
        selector: selectorOf(facts.steps),
        tag: own?.tag ?? "body",
        text: facts.private || text === "" ? null : text,
        classes: classes === "" ? null : classes.slice(0, LONGEST_CLASSES),
        box: {
            x: place(facts.box.x),
            y: place(facts.box.y),
            width: Math.max(0, place(facts.box.width)),
            height: Math.max(0, place(facts.box.height))
        }
    }
}

/**
 * A CSS selector that finds the element again: from the closest ancestor
 * with an id that looks written by hand, or else from the body, each step
 * its tag, its `data-track` and which of its kind it is when its parent
 * has more than one. Tailwind's classes say nothing about which element
 * it is, so none is used. At most `LONGEST_SELECTOR` characters, keeping
 * the steps nearest the element when the whole path is longer.
 */
export function selectorOf(steps: ElementStep[]) {
    const parts: string[] = []
    let anchored = false
    for (const step of steps) {
        if (step.id !== null && HAND_WRITTEN_ID.test(step.id)) {
            parts.unshift(`#${step.id}`)
            anchored = true
            break
        }
        parts.unshift(stepSelector(step))
    }
    if (!anchored) {
        parts.unshift("body")
    }
    // The steps nearest the element, when the whole path is too long
    while (parts.length > 1 && parts.join(" > ").length > LONGEST_SELECTOR) {
        parts.shift()
    }
    return parts.join(" > ").slice(0, LONGEST_SELECTOR)
}

// An id a person wrote, like `pricing`: letters, digits, `-` and `_`, from
// a letter. React's and Base UI's own (`:r1:`, `base-ui-«r5»`) change from
// one render to the next, so they don't find the element again.
const HAND_WRITTEN_ID = /^(?!base-ui-|radix-)[A-Za-z][\w-]*$/

// One step of a selector: its tag, its `data-track`, and which of its kind
// it is among its parent's children
function stepSelector(step: ElementStep) {
    const track =
        step.track === null || step.track === ""
            ? ""
            : `[data-track="${step.track.replace(/["\\]/g, "\\$&")}"]`
    const which = step.siblings > 1 ? `:nth-of-type(${step.position})` : ""
    return `${step.tag}${track}${which}`
}

// A place or a length, in whole CSS pixels, within what Infra takes
function place(value: number) {
    if (!Number.isFinite(value)) {
        return 0
    } else {
        return Math.min(FURTHEST, Math.max(-1_000_000, Math.round(value)))
    }
}

/**
 * A short name for the element, for the toolbar to show: its tag, and the
 * start of its text in quotes, unless it's quoted already, like
 * `a “Book a call”`.
 */
export function elementName(element: CommentedElement) {
    if (element.text === null) {
        return element.tag
    }
    const text =
        element.text.length > 40
            ? `${element.text.slice(0, 39).trimEnd()}…`
            : element.text
    if (/^["“'‘]/.test(text)) {
        return `${element.tag} ${text}`
    } else {
        return `${element.tag} “${text}”`
    }
}
