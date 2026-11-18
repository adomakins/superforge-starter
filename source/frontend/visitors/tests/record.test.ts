import { afterEach, beforeEach, expect, onTestFinished, test, vi } from "vitest"
import { MINUTE, SECOND } from "@/utilities/primitives/durations"
import type { PageBatch, VisitorConsent } from "@/utilities/schemas/visits"
import { recorder, SEND_EVERY, type Sent } from "../record"

// The recorder on a clock and senders of the test's own: what goes to the
// app's /api/visits, how it's sent, when the banner asks, and that nothing
// is ever kept on the device

const START = 1_763_445_600_000

const LANDING = {
    path: "/pricing",
    url: "https://example.com/pricing?utm_source=newsletter",
    referrer: "https://news.ycombinator.com/",
    title: "Pricing",
    screen: { width: 1920, height: 1080 },
    language: "en-US",
    visible: true
}

const BUTTON = {
    tag: "button",
    name: "book-a-call",
    label: null,
    text: "Book a call",
    href: null,
    private: false
}

const ERROR = { message: "Boom", source: null, line: null, column: null }

// What the server answers when a test doesn't say: taken, and no asking
const TAKEN: Sent = { status: 200, ask: false }

beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(console, "warn").mockImplementation(() => {})
    vi.spyOn(console, "debug").mockImplementation(() => {})
})

afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
})

// A promise the test settles itself, for an answer that's still on its way
function later<Value>() {
    let settle: (value: Value) => void = () => {}
    const promise = new Promise<Value>((resolve) => {
        settle = resolve
    })
    return { promise, settle }
}

// A recorder, what it sent, and its clock. `answers` are the server's
// answers to each batch, in turn, null for none, or a promise for one still
// on its way: TAKEN once they run out. `consents` are its answers to the
// visitor's answers to the banner, in turn: kept once they run out.
function setup({
    answers = [],
    consents = []
}: {
    answers?: (Sent | Promise<Sent>)[]
    consents?: (boolean | Promise<boolean>)[]
} = {}) {
    let clock = START
    const calls: { batch: PageBatch; keepalive: boolean }[] = []
    const answered: VisitorConsent[] = []
    const waiting = [...answers]
    const waiting_consents = [...consents]
    const visitors = recorder({
        now: () => clock,
        send: async (batch, keepalive) => {
            calls.push({ batch, keepalive })
            const answer = waiting.shift()
            return await (answer === undefined ? TAKEN : answer)
        },
        sendConsent: async (consent) => {
            answered.push(consent)
            const answer = waiting_consents.shift()
            return await (answer === undefined ? true : answer)
        }
    })
    onTestFinished(() => visitors.stop())
    return {
        visitors,
        calls,
        answered,
        // Every event sent, in order
        sent: () => calls.flatMap((call) => call.batch.events),
        tick: (milliseconds: number) => {
            clock += milliseconds
        }
    }
}

test("every event goes, with only what happened: who the visitor is, the server says", async () => {
    const { visitors, sent, calls } = setup()
    visitors.begin(LANDING)
    visitors.clicked(BUTTON, LANDING.url)
    visitors.track("booked-a-call", { plan: "monthly" })
    visitors.failed(ERROR)
    visitors.navigated("/about", "About")
    await vi.advanceTimersByTimeAsync(SEND_EVERY)

    expect(sent().map((event) => event.name)).toEqual([
        "view",
        "click",
        "booked-a-call",
        "error",
        "leave",
        "view"
    ])
    for (const event of sent()) {
        expect(Object.keys(event).sort()).toEqual([
            "at",
            "name",
            "path",
            "properties"
        ])
    }
    expect(sent()[0]).toEqual({
        name: "view",
        at: START,
        path: "/pricing",
        properties: {
            title: "Pricing",
            referrer: "news.ycombinator.com",
            utm_source: "newsletter",
            screen: "1920x1080",
            language: "en-US"
        }
    })
    expect(sent()[5]).toEqual({
        name: "view",
        at: START,
        path: "/about",
        properties: { title: "About" }
    })
    expect(calls[0]?.batch.sent_at).toBe(START)
})

test("nothing is kept on the device, whatever happens on the page", async () => {
    // Every way a page keeps something, each noting what touches it
    const touched: string[] = []
    function noting(name: string) {
        return new Proxy(
            {},
            {
                get(_target, property) {
                    touched.push(`${name}.${String(property)}`)
                    return undefined
                },
                set(_target, property) {
                    touched.push(`${name}.${String(property)}`)
                    return true
                }
            }
        )
    }
    for (const name of [
        "localStorage",
        "sessionStorage",
        "indexedDB",
        "caches",
        "document"
    ]) {
        vi.stubGlobal(name, noting(name))
    }

    const { visitors, sent } = setup({ answers: [null] })
    visitors.begin(LANDING)
    visitors.clicked(BUTTON, LANDING.url)
    visitors.track("booked-a-call", {})
    await vi.advanceTimersByTimeAsync(SEND_EVERY)
    visitors.hidden()
    visitors.shown()
    visitors.answer("given")
    await vi.advanceTimersByTimeAsync(SEND_EVERY)

    expect(sent().length).toBeGreaterThan(0)
    expect(touched).toEqual([])
})

test("the banner asks when the server's latest answer says to, and stops when it says not to", async () => {
    const { visitors } = setup({
        answers: [
            { status: 200, ask: true },
            { status: 200, ask: true },
            { status: 200, ask: false }
        ]
    })
    const changed = vi.fn()
    visitors.onAskingChange(changed)
    expect(visitors.asking()).toBe(false)

    visitors.begin(LANDING)
    await vi.advanceTimersByTimeAsync(SEND_EVERY)
    expect(visitors.asking()).toBe(true)

    visitors.navigated("/about", "About")
    await vi.advanceTimersByTimeAsync(SEND_EVERY)
    expect(visitors.asking()).toBe(true)

    visitors.navigated("/contact", "Contact")
    await vi.advanceTimersByTimeAsync(SEND_EVERY)
    expect(visitors.asking()).toBe(false)
    // Once as it began asking, once as it stopped
    expect(changed).toHaveBeenCalledTimes(2)
})

test("a failed or refused batch leaves the banner as it was", async () => {
    const { visitors } = setup({
        answers: [{ status: 200, ask: true }, { status: 400, ask: false }, null]
    })
    visitors.begin(LANDING)
    await vi.advanceTimersByTimeAsync(SEND_EVERY)
    visitors.navigated("/about", "About")
    await vi.advanceTimersByTimeAsync(SEND_EVERY)
    visitors.navigated("/contact", "Contact")
    await vi.advanceTimersByTimeAsync(SEND_EVERY)
    expect(visitors.asking()).toBe(true)
})

test("answering hides the banner at once and sends the answer, and a batch the server answered before it knew can't ask again", async () => {
    const first = later<Sent>()
    const consent = later<boolean>()
    const second = later<Sent>()
    const { visitors, answered } = setup({
        answers: [
            { status: 200, ask: true },
            first.promise,
            second.promise,
            { status: 200, ask: true }
        ],
        consents: [consent.promise]
    })
    visitors.begin(LANDING)
    await vi.advanceTimersByTimeAsync(SEND_EVERY)
    expect(visitors.asking()).toBe(true)

    // A batch on its way as the visitor answers
    visitors.navigated("/about", "About")
    await vi.advanceTimersByTimeAsync(SEND_EVERY)
    visitors.answer("given")
    expect(visitors.asking()).toBe(false)
    expect(answered).toEqual(["given"])
    first.settle({ status: 200, ask: true })
    await vi.advanceTimersByTimeAsync(0)
    expect(visitors.asking()).toBe(false)

    // A batch sent while the answer is on its way
    visitors.navigated("/contact", "Contact")
    await vi.advanceTimersByTimeAsync(SEND_EVERY)
    second.settle({ status: 200, ask: true })
    await vi.advanceTimersByTimeAsync(0)
    expect(visitors.asking()).toBe(false)

    // Once the server has it, its answers count again, as when the owner
    // has since changed whom the site asks
    consent.settle(true)
    visitors.navigated("/", "Home")
    await vi.advanceTimersByTimeAsync(SEND_EVERY)
    expect(visitors.asking()).toBe(true)
})

test("an answer the server didn't keep is asked for again by the next batch", async () => {
    const { visitors, answered } = setup({
        answers: [
            { status: 200, ask: true },
            { status: 200, ask: true }
        ],
        consents: [false]
    })
    visitors.begin(LANDING)
    await vi.advanceTimersByTimeAsync(SEND_EVERY)
    visitors.answer("declined")
    expect(visitors.asking()).toBe(false)
    await vi.advanceTimersByTimeAsync(0)

    visitors.navigated("/about", "About")
    await vi.advanceTimersByTimeAsync(SEND_EVERY)
    expect(answered).toEqual(["declined"])
    expect(visitors.asking()).toBe(true)
})

test("a page is viewed once as it lands, then once for each new path", async () => {
    const { visitors, sent } = setup()
    visitors.begin(LANDING)
    // A dev server's strict mode starts it twice
    visitors.begin(LANDING)
    visitors.navigated("/pricing", "Pricing")
    visitors.navigated("/pricing?plan=yearly", "Pricing")
    visitors.navigated("/about", "")
    await vi.advanceTimersByTimeAsync(SEND_EVERY)

    expect(sent().map((event) => [event.name, event.path])).toEqual([
        ["view", "/pricing"],
        ["leave", "/pricing"],
        ["view", "/about"]
    ])
    // A page with no title says none
    expect(sent()[2]?.properties).toEqual({})
})

test("a leave says how far down the page went, and how long it was visible", async () => {
    const { visitors, sent, calls, tick } = setup()
    visitors.begin(LANDING)
    visitors.scrolled(40)
    visitors.scrolled(80)
    visitors.scrolled(60)
    tick(12 * SECOND)
    visitors.hidden()
    // Hidden for a minute, then back for three seconds
    tick(MINUTE)
    visitors.shown()
    tick(3 * SECOND)
    visitors.navigated("/about", "About")
    await vi.advanceTimersByTimeAsync(SEND_EVERY)

    const leaves = sent().filter((event) => event.name === "leave")
    expect(leaves.map((event) => event.properties)).toEqual([
        { scroll: 80, visible_ms: 12 * SECOND },
        { scroll: 80, visible_ms: 3 * SECOND }
    ])
    // What was waiting as the page hid went at once, to outlive it
    expect(calls[0]?.keepalive).toBe(true)
    expect(calls[0]?.batch.events.map((event) => event.name)).toEqual([
        "view",
        "leave"
    ])
})

test("a page sends its first ten errors", async () => {
    const { visitors, sent } = setup()
    visitors.begin(LANDING)
    for (let error = 0; error < 15; error++) {
        visitors.failed(ERROR)
    }
    visitors.navigated("/about", "About")
    visitors.failed(ERROR)
    await vi.advanceTimersByTimeAsync(SEND_EVERY)
    const errors = sent().filter((event) => event.name === "error")
    expect(errors.filter((event) => event.path === "/pricing")).toHaveLength(10)
    expect(errors.filter((event) => event.path === "/about")).toHaveLength(1)
})

test("the app's events are checked as Infra checks them, and never take the script's names", async () => {
    const { visitors, sent } = setup()
    visitors.begin(LANDING)
    visitors.track("Booked a call", {})
    visitors.track("view", {})
    visitors.track("booked-a-call", { notes: "x".repeat(1001) })
    visitors.track("booked-a-call", { plan: "monthly", seats: 3 })
    await vi.advanceTimersByTimeAsync(SEND_EVERY)
    expect(sent().map((event) => event.name)).toEqual(["view", "booked-a-call"])
    expect(console.warn).toHaveBeenCalledTimes(3)
})

test("events go every five seconds, at most 100 a call", async () => {
    const { visitors, calls } = setup()
    visitors.begin(LANDING)
    for (let event = 0; event < 249; event++) {
        visitors.track("tried", {})
    }
    await vi.advanceTimersByTimeAsync(SEND_EVERY - 1)
    expect(calls).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(3 * SEND_EVERY)
    expect(calls.map((call) => call.batch.events.length)).toEqual([
        100, 100, 50
    ])
    expect(calls.every((call) => !call.keepalive)).toBe(true)
})

test("a batch the server refuses is dropped, and one it couldn't take is tried again, later each time", async () => {
    const refused = setup({ answers: [{ status: 400, ask: false }] })
    refused.visitors.begin(LANDING)
    await vi.advanceTimersByTimeAsync(10 * MINUTE)
    expect(refused.calls).toHaveLength(1)

    const down = setup({
        answers: [null, { status: 503, ask: false }, TAKEN]
    })
    down.visitors.begin(LANDING)
    await vi.advanceTimersByTimeAsync(SEND_EVERY)
    expect(down.calls).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(2 * SEND_EVERY)
    expect(down.calls).toHaveLength(2)
    await vi.advanceTimersByTimeAsync(4 * SEND_EVERY - 1)
    expect(down.calls).toHaveLength(2)
    await vi.advanceTimersByTimeAsync(1)
    expect(down.calls).toHaveLength(3)
    // The same view each time, until it went
    expect(
        down.calls.map((call) => call.batch.events.map((event) => event.at))
    ).toEqual([[START], [START], [START]])
    await vi.advanceTimersByTimeAsync(10 * MINUTE)
    expect(down.calls).toHaveLength(3)
})

test("while the server is down, a hiding page tries once more, and what didn't go waits in memory for the page's return", async () => {
    const { visitors, calls } = setup({ answers: [null, null] })
    visitors.begin(LANDING)
    await vi.advanceTimersByTimeAsync(SEND_EVERY)
    visitors.hidden()
    await vi.advanceTimersByTimeAsync(0)
    expect(calls.map((call) => call.keepalive)).toEqual([false, true])

    // After the wait two failures call for
    visitors.shown()
    await vi.advanceTimersByTimeAsync(4 * SEND_EVERY)
    expect(calls).toHaveLength(3)
    expect(calls[2]?.batch.events.map((event) => event.name)).toEqual([
        "view",
        "leave"
    ])
})
