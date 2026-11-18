import { expect, test, vi } from "vitest"
import { WEEK } from "@/utilities/primitives/durations"
import { KEYS, memoryStorage } from "../device"
import {
    BATCH_BYTES,
    EVENTS_A_CALL,
    keepWaiting,
    type PageEvent,
    QUEUE_LIMIT,
    queued,
    takeBatch,
    takeWaiting
} from "../queue"

// The events waiting to be sent: a call's worth at a time, under Infra's
// limits, at most 500 kept, and what a page couldn't send kept on the
// device for the next

const NOW = 1_763_445_600_000

function event(at = NOW, properties: PageEvent["properties"] = {}) {
    return { name: "view", at, path: "/", properties }
}

function bodyBytes(events: PageEvent[]) {
    return new TextEncoder().encode(JSON.stringify({ sent_at: NOW, events }))
        .byteLength
}

test("a call carries at most 100 events", () => {
    const events = Array.from({ length: 250 }, (_, index) => event(NOW + index))
    const first = takeBatch(events)
    expect(first.batch).toHaveLength(EVENTS_A_CALL)
    expect(first.rest).toHaveLength(150)
    expect(first.batch[0]?.at).toBe(NOW)
    expect(first.rest[0]?.at).toBe(NOW + 100)
})

test("a call's body stays under its bytes, whatever its events hold", () => {
    const events = Array.from({ length: 60 }, () =>
        event(NOW, { note: "é".repeat(900) })
    )
    const { batch, bytes, rest } = takeBatch(events)
    expect(batch.length).toBeGreaterThan(0)
    expect(batch.length + rest.length).toBe(60)
    expect(bodyBytes(batch)).toBeLessThanOrEqual(bytes)
    expect(bytes).toBeLessThanOrEqual(BATCH_BYTES)
    // One more wouldn't have fit
    expect(bodyBytes([...batch, ...rest.slice(0, 1)])).toBeGreaterThan(
        BATCH_BYTES - 8
    )
})

test("an event too big for any call is dropped, and the rest still go", () => {
    const huge = event(NOW, {
        a: "x".repeat(1000),
        b: "€".repeat(1000),
        c: "€".repeat(1000),
        d: "€".repeat(1000),
        e: "€".repeat(1000),
        f: "€".repeat(1000),
        g: "€".repeat(1000),
        h: "€".repeat(1000),
        i: "€".repeat(1000),
        j: "€".repeat(1000),
        k: "€".repeat(1000),
        l: "€".repeat(1000)
    })
    const { batch, oversized, rest } = takeBatch([event(), huge, event()])
    expect(oversized).toEqual([huge])
    expect(batch).toHaveLength(2)
    expect(rest).toEqual([])
})

test("past 500 waiting, the oldest are dropped", () => {
    const old = Array.from({ length: QUEUE_LIMIT }, (_, index) =>
        event(NOW + index)
    )
    const now = queued(old, [event(NOW + 1000), event(NOW + 1001)])
    expect(now).toHaveLength(QUEUE_LIMIT)
    expect(now[0]?.at).toBe(NOW + 2)
    expect(now.at(-1)?.at).toBe(NOW + 1001)
})

test("what's kept waiting is taken once, by the next page", () => {
    const storage = memoryStorage()
    keepWaiting(storage, [event(NOW - 1000)], NOW)
    keepWaiting(storage, [event(NOW)], NOW)
    expect(takeWaiting(storage, NOW)).toEqual([event(NOW - 1000), event(NOW)])
    expect(storage.items.has(KEYS.waiting)).toBe(false)
    expect(takeWaiting(storage, NOW)).toEqual([])
})

test("what's kept waiting drops a week-old event, and one in another shape", () => {
    vi.spyOn(console, "debug").mockImplementation(() => {})
    const storage = memoryStorage()
    storage.setItem(
        KEYS.waiting,
        JSON.stringify([
            event(NOW - WEEK - 1),
            { name: "View!", at: NOW, path: "/", properties: {} },
            event(NOW)
        ])
    )
    expect(takeWaiting(storage, NOW)).toEqual([event(NOW)])

    storage.setItem(KEYS.waiting, "{ not json")
    expect(takeWaiting(storage, NOW)).toEqual([])
})
