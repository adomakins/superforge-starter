import { afterEach, beforeEach, expect, onTestFinished, test, vi } from "vitest"
import { MINUTE, SECOND } from "@/utilities/primitives/durations"
import type { ConsentSetting } from "../consent"
import { type DeviceStorage, KEYS, memoryStorage } from "../device"
import type { Batch } from "../queue"
import { recorder, SEND_EVERY } from "../record"

// The recorder on storage, a clock and a sender of the test's own: what
// goes to Infra before a visitor answers the banner, after they accept and
// after they decline, and how it's sent

const START = 1_763_445_600_000

const LANDING = {
    path: "/pricing",
    url: "https://example.com/pricing?utm_source=newsletter",
    referrer: "https://news.ycombinator.com/",
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

beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(console, "warn").mockImplementation(() => {})
    vi.spyOn(console, "debug").mockImplementation(() => {})
})

afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
})

// A recorder, what it sent, and its clock. `statuses` are Infra's answers,
// in turn, null for none: 200 once they run out.
function setup({
    setting = "ask",
    storage = memoryStorage(),
    statuses = []
}: {
    setting?: ConsentSetting
    storage?: DeviceStorage
    statuses?: (number | null)[]
} = {}) {
    let clock = START
    const calls: { batch: Batch; keepalive: boolean }[] = []
    const answers = [...statuses]
    const visitors = recorder({
        setting,
        storage,
        now: () => clock,
        send: async (batch, keepalive) => {
            calls.push({ batch, keepalive })
            const answer = answers.shift()
            return answer === undefined ? 200 : answer
        }
    })
    onTestFinished(() => visitors.stop())
    return {
        visitors,
        calls,
        // Every event sent, in order
        sent: () => calls.flatMap((call) => call.batch.events),
        tick: (milliseconds: number) => {
            clock += milliseconds
        }
    }
}

test("before a visitor answers, only views, leaves and errors go, anonymous, and nothing is kept", async () => {
    const storage = memoryStorage()
    const { visitors, sent } = setup({ storage })
    visitors.begin(LANDING)
    visitors.identify("user_42")
    visitors.clicked(BUTTON, LANDING.url)
    visitors.track("booked-a-call", {})
    visitors.failed(ERROR)
    visitors.navigated("/about")
    await vi.advanceTimersByTimeAsync(SEND_EVERY)

    expect(sent().map((event) => event.name)).toEqual([
        "view",
        "error",
        "leave",
        "view"
    ])
    for (const event of sent()) {
        expect(event).not.toHaveProperty("visitor")
        expect(event).not.toHaveProperty("session")
        expect(event).not.toHaveProperty("user")
    }
    expect(sent()[0]).toEqual({
        name: "view",
        at: START,
        path: "/pricing",
        properties: {
            referrer: "news.ycombinator.com",
            utm_source: "newsletter"
        }
    })
    expect(visitors.asking()).toBe(true)
    expect(storage.items.size).toBe(0)
})

test("once a visitor accepts, every event carries their IDs and who's signed in, clicks and the app's events too", async () => {
    const storage = memoryStorage()
    const { visitors, sent } = setup({ storage })
    visitors.begin(LANDING)
    visitors.answer("accepted")
    visitors.identify("user_42")
    visitors.clicked(BUTTON, LANDING.url)
    visitors.track("booked-a-call", { plan: "monthly" })
    await vi.advanceTimersByTimeAsync(SEND_EVERY)

    const [landing, click, booked] = sent()
    // The view came before the answer, so it stays anonymous
    expect(landing).not.toHaveProperty("visitor")
    expect(click).toMatchObject({
        name: "click",
        visitor: expect.stringMatching(/^v_/),
        session: expect.stringMatching(/^s_/),
        user: "user_42",
        properties: { target: "book-a-call", text: "Book a call" }
    })
    expect(booked).toMatchObject({
        name: "booked-a-call",
        visitor: click?.visitor,
        session: click?.session,
        properties: { plan: "monthly" }
    })
    expect(visitors.asking()).toBe(false)
    expect(storage.items.get(KEYS.consent)).toBe('"accepted"')
    expect(storage.items.has(KEYS.visitor)).toBe(true)
})

test("an answer is remembered, so the banner asks once", () => {
    const storage = memoryStorage()
    setup({ storage }).visitors.answer("declined")
    const later = setup({ storage })
    expect(later.visitors.asking()).toBe(false)
})

test("declining keeps only the answer, and what's waiting loses its IDs and clicks", async () => {
    const storage = memoryStorage()
    const { visitors, sent } = setup({ storage })
    visitors.answer("accepted")
    visitors.begin(LANDING)
    visitors.clicked(BUTTON, LANDING.url)
    visitors.answer("declined")
    await vi.advanceTimersByTimeAsync(SEND_EVERY)

    expect(sent()).toHaveLength(1)
    expect(sent()[0]).toEqual({
        name: "view",
        at: START,
        path: "/pricing",
        properties: expect.any(Object)
    })
    expect([...storage.items.keys()]).toEqual([KEYS.consent])
    expect(storage.items.get(KEYS.consent)).toBe('"declined"')
})

test("assuming consent remembers from the first view and never asks, unless the visitor once declined", async () => {
    const { visitors, sent } = setup({ setting: "assume" })
    expect(visitors.asking()).toBe(false)
    visitors.begin(LANDING)
    await vi.advanceTimersByTimeAsync(SEND_EVERY)
    expect(sent()[0]?.visitor).toMatch(/^v_/)

    const storage = memoryStorage()
    storage.setItem(KEYS.consent, '"declined"')
    const declined = setup({ setting: "assume", storage })
    declined.visitors.begin(LANDING)
    await vi.advanceTimersByTimeAsync(SEND_EVERY)
    expect(declined.sent()[0]).not.toHaveProperty("visitor")
})

test("a visit ends after half an hour with nothing happening", async () => {
    const { visitors, sent, tick } = setup({ setting: "assume" })
    visitors.begin(LANDING)
    tick(29 * MINUTE)
    visitors.navigated("/about")
    tick(31 * MINUTE)
    visitors.navigated("/contact")
    await vi.advanceTimersByTimeAsync(SEND_EVERY)

    const sessions = sent().map((event) => [event.name, event.session])
    const [first, second] = [...new Set(sessions.map(([, id]) => id))]
    expect(sessions).toEqual([
        ["view", first],
        ["leave", first],
        ["view", first],
        // The leave belongs to the visit its view was in
        ["leave", first],
        ["view", second]
    ])
    expect(second).not.toBe(first)
})

test("a page is viewed once as it lands, then once for each new path", async () => {
    const { visitors, sent } = setup()
    visitors.begin(LANDING)
    // A dev server's strict mode starts it twice
    visitors.begin(LANDING)
    visitors.navigated("/pricing")
    visitors.navigated("/pricing?plan=yearly")
    visitors.navigated("/about")
    await vi.advanceTimersByTimeAsync(SEND_EVERY)

    expect(sent().map((event) => [event.name, event.path])).toEqual([
        ["view", "/pricing"],
        ["leave", "/pricing"],
        ["view", "/about"]
    ])
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
    visitors.navigated("/about")
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
    visitors.navigated("/about")
    visitors.failed(ERROR)
    await vi.advanceTimersByTimeAsync(SEND_EVERY)
    const errors = sent().filter((event) => event.name === "error")
    expect(errors.filter((event) => event.path === "/pricing")).toHaveLength(10)
    expect(errors.filter((event) => event.path === "/about")).toHaveLength(1)
})

test("the app's events are checked as Infra checks them, and never take the script's names", async () => {
    const { visitors, sent } = setup({ setting: "assume" })
    visitors.begin(LANDING)
    visitors.track("Booked a call", {})
    visitors.track("view", {})
    visitors.track("booked-a-call", { notes: "x".repeat(1001) })
    visitors.track("booked-a-call", { plan: "monthly", seats: 3 })
    await vi.advanceTimersByTimeAsync(SEND_EVERY)
    expect(sent().map((event) => event.name)).toEqual(["view", "booked-a-call"])
    expect(console.warn).toHaveBeenCalledTimes(3)
})

test("an email is never who's signed in", async () => {
    const { visitors, sent } = setup({ setting: "assume" })
    visitors.identify("ada@example.com")
    visitors.begin(LANDING)
    await vi.advanceTimersByTimeAsync(SEND_EVERY)
    expect(sent()[0]).not.toHaveProperty("user")
})

test("events go every five seconds, at most 100 a call", async () => {
    const { visitors, calls } = setup({ setting: "assume" })
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

test("a batch Infra refuses is dropped, and one it couldn't take is tried again, later each time", async () => {
    const refused = setup({ statuses: [400] })
    refused.visitors.begin(LANDING)
    await vi.advanceTimersByTimeAsync(10 * MINUTE)
    expect(refused.calls).toHaveLength(1)

    const down = setup({ statuses: [null, 503, 200] })
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

test("while Infra is down, what a remembered visitor's page couldn't send waits on the device for the next", async () => {
    const storage = memoryStorage()
    const first = setup({ setting: "assume", storage, statuses: [null] })
    first.visitors.begin(LANDING)
    await vi.advanceTimersByTimeAsync(SEND_EVERY)
    first.visitors.hidden()
    expect(first.calls).toHaveLength(1)
    expect(storage.items.has(KEYS.waiting)).toBe(true)

    const next = setup({ setting: "assume", storage })
    next.visitors.begin({ ...LANDING, path: "/about" })
    await vi.advanceTimersByTimeAsync(SEND_EVERY)
    expect(next.sent().map((event) => [event.name, event.path])).toEqual([
        ["view", "/pricing"],
        ["leave", "/pricing"],
        ["view", "/about"]
    ])
    expect(storage.items.has(KEYS.waiting)).toBe(false)
})

test("an anonymous visitor's page tries once more as it hides, and keeps nothing", async () => {
    const storage = memoryStorage()
    const { visitors, calls } = setup({ storage, statuses: [null] })
    visitors.begin(LANDING)
    await vi.advanceTimersByTimeAsync(SEND_EVERY)
    visitors.hidden()
    expect(calls.map((call) => call.keepalive)).toEqual([false, true])
    expect(storage.items.size).toBe(0)
})

test("declining in another tab holds in this one at once, and what's waiting here loses its IDs", async () => {
    const storage = memoryStorage()
    const here = setup({ storage })
    here.visitors.answer("accepted")
    here.visitors.begin(LANDING)
    here.visitors.clicked(BUTTON, LANDING.url)

    setup({ storage }).visitors.answer("declined")
    here.visitors.storageChanged()
    here.visitors.navigated("/about")
    await vi.advanceTimersByTimeAsync(SEND_EVERY)

    expect(here.sent().map((event) => event.name)).toEqual([
        "view",
        "leave",
        "view"
    ])
    for (const event of here.sent()) {
        expect(event).not.toHaveProperty("visitor")
    }
    expect([...storage.items.keys()]).toEqual([KEYS.consent])
})

test("once the site's data is cleared, nothing is kept again until the visitor answers again", async () => {
    const storage = memoryStorage()
    const { visitors, sent } = setup({ storage })
    visitors.answer("accepted")
    storage.items.clear()
    visitors.begin(LANDING)
    await vi.advanceTimersByTimeAsync(SEND_EVERY)
    expect(sent()[0]).not.toHaveProperty("visitor")
    expect(storage.items.size).toBe(0)
    expect(visitors.asking()).toBe(true)
})

test("an answer the device refuses to keep still holds for the page", () => {
    const refusing: DeviceStorage = {
        getItem: () => null,
        setItem: () => {
            throw new DOMException("Full", "QuotaExceededError")
        },
        removeItem: () => {}
    }
    const { visitors } = setup({ storage: refusing })
    visitors.answer("declined")
    expect(visitors.asking()).toBe(false)
})
