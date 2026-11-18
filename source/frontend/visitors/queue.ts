import { z } from "zod"
import { WEEK } from "@/utilities/primitives/durations"
import {
    app_user_id,
    browser_id,
    event_name,
    event_properties,
    page_path
} from "@/utilities/schemas/events"
import {
    type DeviceStorage,
    KEYS,
    readStored,
    removeStored,
    writeStored
} from "./device"

// The events waiting to be sent, and how they're split into calls Infra
// takes: at most 100 events, and well under its 64 KB, so a page closing
// can send one with `keepalive`, which allows 64 KB for all of a page's
// calls in flight at once.

/**
 * An event as a page sends it (backend/infra/README.md, "Events"): `at` in
 * milliseconds by the browser's clock, and the IDs only once the visitor
 * agreed to them.
 */
export const page_event = z.object({
    name: event_name,
    at: z.number().int().nonnegative(),
    path: page_path,
    visitor: browser_id.optional(),
    session: browser_id.optional(),
    user: app_user_id.optional(),
    properties: event_properties
})
export type PageEvent = z.infer<typeof page_event>

/** What one call carries: when it was sent, and its events. */
export type Batch = { sent_at: number; events: PageEvent[] }

/** The most events a page holds, its oldest dropped past it. */
export const QUEUE_LIMIT = 500

/** The most events one call carries, as Infra takes them. */
export const EVENTS_A_CALL = 100

/** The most bytes one call's body is, well under Infra's 64 KB. */
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

// What's kept waiting, read back: each event on its own, so one an older
// version wrote differently doesn't lose the rest
const kept_waiting = z.array(z.unknown())

/**
 * Takes the events kept waiting on this device, by this page or another
 * of the site's, leaving none there: those Infra would still keep, less
 * than a week old at `now`.
 */
export function takeWaiting(storage: DeviceStorage, now: number) {
    const kept = readStored(storage, KEYS.waiting, kept_waiting) ?? []
    removeStored(storage, KEYS.waiting)
    return kept.flatMap((each) => {
        const parsed = page_event.safeParse(each)
        if (parsed.success && parsed.data.at > now - WEEK) {
            return [parsed.data]
        } else {
            return []
        }
    })
}

/**
 * Keeps `events` waiting on this device, after any already there, for the
 * next page of the site to send: what a page couldn't send before it hid.
 */
export function keepWaiting(
    storage: DeviceStorage,
    events: PageEvent[],
    now: number
) {
    if (events.length === 0) {
        return
    }
    const waiting = queued(takeWaiting(storage, now), events)
    writeStored(storage, KEYS.waiting, waiting)
}
