import { z } from "zod"
import { MINUTE } from "@/utilities/primitives/durations"
import { browser_id } from "@/utilities/schemas/events"
import { type DeviceStorage, KEYS, readStored, writeStored } from "./device"

// Who a remembered browser is, kept on it once the visitor has accepted
// (consent.ts): its lasting visitor ID, and its visit's ID, which a new
// one replaces after half an hour with nothing happening.

/** How long a visit lasts with nothing happening. */
export const VISIT_IDLE = 30 * MINUTE

// A visit as it's kept: its ID, and when it last saw anything happen
const stored_visit = z.object({ id: browser_id, active_at: z.number() })

/**
 * A new ID: `prefix`, then a random UUID's 32 hex digits, which fits
 * Infra's 8 to 64 letters, digits, `_` or `-`.
 */
export function newId(prefix: "v" | "s") {
    return `${prefix}_${randomHex()}`
}

// 128 random bits as hex: a UUID's, or, where `crypto.randomUUID` is
// missing (a page served over plain http from another computer), the same
// from `getRandomValues`
function randomHex() {
    if (typeof crypto.randomUUID === "function") {
        return crypto.randomUUID().replaceAll("-", "")
    } else {
        const bytes = crypto.getRandomValues(new Uint8Array(16))
        return Array.from(bytes, (byte) =>
            byte.toString(16).padStart(2, "0")
        ).join("")
    }
}

/** This browser's lasting ID: the one it keeps, or a new one, kept. */
export function visitorId(storage: DeviceStorage) {
    const kept = readStored(storage, KEYS.visitor, browser_id)
    if (kept !== null) {
        return kept
    } else {
        const id = newId("v")
        writeStored(storage, KEYS.visitor, id)
        return id
    }
}

/**
 * The visit's ID at `now`: the one kept while something has happened in
 * the last half hour, and otherwise a new one. `active` says whether
 * something happens now, which keeps the visit going. A page's `leave`
 * isn't: it belongs to the visit its view was in, however long ago, so it
 * neither keeps one going nor starts one when there's one to belong to.
 */
export function sessionId(
    storage: DeviceStorage,
    now: number,
    active: boolean
) {
    const kept = readStored(storage, KEYS.session, stored_visit)
    if (kept !== null && now - kept.active_at < VISIT_IDLE) {
        if (active) {
            writeStored(storage, KEYS.session, { id: kept.id, active_at: now })
        }
        return kept.id
    } else if (kept !== null && !active) {
        return kept.id
    } else {
        const id = newId("s")
        writeStored(storage, KEYS.session, { id, active_at: now })
        return id
    }
}
