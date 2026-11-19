import { EVENTS_A_CALL } from "@/utilities/schemas/events"
import type { PageEvent } from "@/utilities/schemas/visits"

// The events waiting to be sent, in the page's memory only, and how
// they're split into calls the app's /api/visits takes: at most 100
// events, and well under its 64 KB, so a page closing can send one with
// `keepalive`, which allows 64 KB for all of a page's calls in flight at
// once.

/** The most events a page holds, its oldest dropped past it. */
export const QUEUE_LIMIT = 500

/** The most bytes one call's body is, well under the route's 64 KB. */
export const BATCH_BYTES = 32 * 1024

/**
 * The most bytes sent with `keepalive` as a page hides: under the 64 KB a
 * browser allows for them all.
 */
export const KEEPALIVE_BYTES = 60 * 1024

// A call's body with no events, its time as long as one can be
const ENVELOPE = bytesOf({ sent_at: Number.MAX_SAFE_INTEGER, events: [] })

function bytesOf(value: unknown) {
    return new TextEncoder().encode(JSON.stringify(value)).byteLength
}

/** `queue` with `events` after it, its oldest dropped past QUEUE_LIMIT. */
export function queued(queue: PageEvent[], events: PageEvent[]) {
    const all = [...queue, ...events]
    return all.slice(Math.max(all.length - QUEUE_LIMIT, 0))
}

/**
 * The first call's worth of `events`, its body's size in bytes, and the
 * rest. An event too big to go in any call, which only the app's own
 * events can be, is never sent: it's in `oversized`, to be logged.
 */
export function takeBatch(events: PageEvent[]) {
    const batch: PageEvent[] = []
    const oversized: PageEvent[] = []
    let bytes = ENVELOPE
    let taken = 0
    for (const event of events) {
        // Its JSON and the comma before it
        const size = bytesOf(event) + 1
        if (ENVELOPE + size > BATCH_BYTES) {
            oversized.push(event)
        } else if (
            batch.length === EVENTS_A_CALL ||
            bytes + size > BATCH_BYTES
        ) {
            break
        } else {
            batch.push(event)
            bytes += size
        }
        taken += 1
    }
    return { batch, bytes, oversized, rest: events.slice(taken) }
}
