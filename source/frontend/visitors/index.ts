import type { EventProperties } from "@/utilities/schemas/events"
import type { VisitorConsent } from "@/utilities/schemas/visits"
import { listen, sendBatch, sendConsent, type VisitorsRouter } from "./browser"
import { type Recorder, recorder } from "./record"

// What visitors view, click and run into on the site's pages, sent to the
// app's own /api/visits, whose server sends them on to Superforge Infra for
// the owner's dashboard and Claude. README.md here has what's recorded,
// what never is, and how a visitor is remembered and asked. Nothing is kept
// on the device by this script, and everything here does nothing in the
// prerender, so a page can call it anywhere.

export type { VisitorsRouter } from "./browser"

let running: Recorder | undefined

// The page's recorder, made the first time it's needed in a browser, or
// null on the server
function visitors() {
    if (typeof window === "undefined") {
        return null
    }
    running ??= recorder({ now: Date.now, send: sendBatch, sendConsent })
    return running
}

/**
 * Starts recording the page: the one it landed on, each one the router
 * resolves after it, and the scrolling, clicks and errors on them. Answers
 * how to stop, for an effect's cleanup: the root route calls it from one,
 * which never runs in the prerender.
 */
export function startVisitors(router: VisitorsRouter): () => void {
    const started = visitors()
    if (started === null) {
        return () => {}
    } else {
        return listen(started, router)
    }
}

/**
 * Records the app's own event, like `track("booked-a-call", { plan:
 * "monthly" })`: its name in lowercase words joined by hyphens, and at
 * most 32 flat properties. What must count even when the page can't send
 * it, like a payment, the server sends (backend/infra/).
 */
export function track(name: string, properties: EventProperties = {}) {
    visitors()?.track(name, properties)
}

/**
 * The visitor's answer to the consent banner, which hides it and goes to
 * the server, which keeps it in a cookie.
 */
export function answerConsent(consent: VisitorConsent) {
    visitors()?.answer(consent)
}

/** Whether the consent banner asks this visitor now. */
export function askingConsent() {
    return visitors()?.asking() ?? false
}

/** Calls `listener` when whether the banner asks changes; answers how to stop. */
export function onAskingChange(listener: () => void): () => void {
    return visitors()?.onAskingChange(listener) ?? (() => {})
}
