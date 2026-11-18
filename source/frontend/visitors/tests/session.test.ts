import { expect, test } from "vitest"
import { MINUTE } from "@/utilities/primitives/durations"
import { browser_id } from "@/utilities/schemas/events"
import { KEYS, memoryStorage } from "../device"
import { newId, sessionId, VISIT_IDLE, visitorId } from "../session"

// A remembered browser's IDs, on storage and a clock of the test's own:
// the visitor's lasts, and a visit's ends after half an hour with nothing
// happening

const START = 1_763_445_600_000

test("a new ID is a prefix and a UUID's hex, which Infra takes", () => {
    const visitor = newId("v")
    expect(visitor).toMatch(/^v_[0-9a-f]{32}$/)
    expect(newId("s")).toMatch(/^s_[0-9a-f]{32}$/)
    expect(browser_id.safeParse(visitor).success).toBe(true)
    expect(newId("v")).not.toBe(visitor)
})

test("the browser's ID is made once and kept", () => {
    const storage = memoryStorage()
    const first = visitorId(storage)
    expect(visitorId(storage)).toBe(first)
    expect(storage.items.get(KEYS.visitor)).toBe(JSON.stringify(first))
})

test("an ID kept in another shape is replaced", () => {
    const storage = memoryStorage()
    storage.setItem(KEYS.visitor, JSON.stringify("short"))
    storage.setItem(KEYS.session, "not json")
    expect(visitorId(storage)).toMatch(/^v_[0-9a-f]{32}$/)
    expect(sessionId(storage, START, true)).toMatch(/^s_[0-9a-f]{32}$/)
})

test("a visit lasts while something happens, and a new one starts after half an hour with nothing", () => {
    const storage = memoryStorage()
    const first = sessionId(storage, START, true)
    // Something every 20 minutes keeps it going for an hour
    expect(sessionId(storage, START + 20 * MINUTE, true)).toBe(first)
    expect(sessionId(storage, START + 40 * MINUTE, true)).toBe(first)
    expect(sessionId(storage, START + 60 * MINUTE, true)).toBe(first)
    // Then half an hour with nothing
    const next = sessionId(storage, START + 60 * MINUTE + VISIT_IDLE, true)
    expect(next).not.toBe(first)
    expect(sessionId(storage, START + 61 * MINUTE + VISIT_IDLE, true)).toBe(
        next
    )
})

test("a leave belongs to its visit, however late, and doesn't keep it going", () => {
    const storage = memoryStorage()
    const first = sessionId(storage, START, true)
    // A leave two hours on, from a tab left open
    expect(sessionId(storage, START + 120 * MINUTE, false)).toBe(first)
    // It didn't keep the visit going: anything after it starts another
    expect(sessionId(storage, START + 121 * MINUTE, true)).not.toBe(first)
})

test("a leave with no visit to belong to starts one", () => {
    const storage = memoryStorage()
    const started = sessionId(storage, START, false)
    expect(started).toMatch(/^s_/)
    expect(sessionId(storage, START + MINUTE, true)).toBe(started)
})
