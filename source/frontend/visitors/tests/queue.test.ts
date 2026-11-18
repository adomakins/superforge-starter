import { expect, test } from "vitest"
import { EVENTS_A_CALL } from "@/utilities/schemas/events"
import type { PageEvent } from "@/utilities/schemas/visits"
import { BATCH_BYTES, QUEUE_LIMIT, queued, takeBatch } from "../queue"

// The events waiting to be sent, in the page's memory: a call's worth at a
// time, under the route's and Infra's limits, and at most 500 kept

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
