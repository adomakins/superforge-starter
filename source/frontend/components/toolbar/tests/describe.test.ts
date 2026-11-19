import { expect, test } from "vitest"
import {
    describeElement,
    type ElementFacts,
    type ElementStep,
    elementName,
    selectorOf
} from "../describe"

// What a comment says about the element it's on, from what the page said
// about it: a selector that finds it again, and text by the visitors'
// rules

// A step up from the element, an only child unless the test says
function step(tag: string, more: Partial<ElementStep> = {}): ElementStep {
    return { tag, id: null, track: null, position: 1, siblings: 1, ...more }
}

// A link in the second of a main's sections, unless the test says
function facts(more: Partial<ElementFacts> = {}): ElementFacts {
    return {
        steps: [
            step("a"),
            step("section", { position: 2, siblings: 3 }),
            step("main"),
            step("div")
        ],
        label: null,
        text: "Book a call",
        classes: "inline-flex  rounded-md\n bg-primary",
        private: false,
        box: { x: 120.4, y: 1639.6, width: 180, height: 44.2 },
        ...more
    }
}

test("the selector goes from the body, saying which of its kind each step is", () => {
    expect(describeElement(facts())).toEqual({
        selector: "body > div > main > section:nth-of-type(2) > a",
        tag: "a",
        text: "Book a call",
        classes: "inline-flex rounded-md bg-primary",
        box: { x: 120, y: 1640, width: 180, height: 44 }
    })
})

test("an id someone wrote anchors the selector, and React's own don't", () => {
    expect(
        selectorOf([
            step("button", { id: ":r3:" }),
            step("section", { id: "pricing" }),
            step("main")
        ])
    ).toBe("#pricing > button")
    expect(
        selectorOf([step("div", { id: "base-ui-«r5»" }), step("main")])
    ).toBe("body > main > div")
})

test("a data-track names its step", () => {
    expect(
        selectorOf([step("a", { track: "book-a-call" }), step("header")])
    ).toBe('body > header > a[data-track="book-a-call"]')
})

test("a selector too long for Infra keeps the steps nearest the element", () => {
    const deep = Array.from({ length: 200 }, () =>
        step("div", { position: 12, siblings: 12 })
    )
    const selector = selectorOf([step("button"), ...deep])
    expect(selector.length).toBeLessThanOrEqual(1000)
    expect(selector.endsWith("div:nth-of-type(12) > button")).toBe(true)
    expect(selector.startsWith("body")).toBe(false)
})

test("text follows the visitors' rules: no email, and none at all when private", () => {
    expect(
        describeElement(facts({ text: "Write to ada@example.com today" })).text
    ).toBe("Write to [email] today")
    expect(describeElement(facts({ private: true })).text).toBeNull()
    expect(
        describeElement(facts({ label: "Close the menu", text: "" })).text
    ).toBe("Close the menu")
    expect(describeElement(facts({ text: "  \n " })).text).toBeNull()
})

test("a short name for the toolbar: the tag and the start of the text", () => {
    const element = describeElement(facts())
    expect(elementName(element)).toBe("a “Book a call”")
    expect(elementName({ ...element, text: null })).toBe("a")
    expect(elementName({ ...element, text: "“start here”" })).toBe(
        "a “start here”"
    )
    expect(elementName({ ...element, text: "x".repeat(60) })).toBe(
        `a “${"x".repeat(39)}…”`
    )
})
