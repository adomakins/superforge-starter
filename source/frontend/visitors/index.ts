import type { EventProperties } from "@/utilities/schemas/events"
import { listen, sender, type VisitorsRouter } from "./browser"
import { CONSENT, type ConsentAnswer } from "./consent"
import { deviceStorage, memoryStorage } from "./device"
import { PROJECT_ID } from "./project"
import { type Recorder, recorder } from "./record"

// What visitors view, click and run into on the site's pages, sent to
// Superforge Infra for the owner's dashboard and Claude. README.md here has
// what's recorded, what never is, and the consent it asks for. Everything
// here does nothing in the prerender and in an app with no Infra project
// yet, so a page can call it anywhere.

export type { VisitorsRouter } from "./browser"
export type { ConsentAnswer } from "./consent"

let running: Recorder | undefined

// The page's recorder, made the first time it's needed in a browser, or
// null where nothing is recorded
function visitors() {
    if (typeof window === "undefined" || PROJECT_ID === null) {
        return null
    }
    running ??= recorder({
        setting: CONSENT,
        storage: deviceStorage() ?? memoryStorage(),
        now: Date.now,
        send: sender(PROJECT_ID, import.meta.env.DEV)
    })
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
 * most 32 flat properties. Only of a visitor who agreed to be remembered;
 * what must count for everyone, the server sends (backend/infra/).
 */
export function track(name: string, properties: EventProperties = {}) {
    visitors()?.track(name, properties)
}

/**
 * Who's signed in, by the app's own user ID, never their email: their
 * events carry it once they've agreed to be remembered. Null once they
 * sign out.
 */
export function identify(user_id: string | null) {
    visitors()?.identify(user_id)
}

/** The visitor's answer to the consent banner. */
export function answerConsent(answer: ConsentAnswer) {
    visitors()?.answer(answer)
}

/** Whether the consent banner asks this visitor now. */
export function askingConsent() {
    return visitors()?.asking() ?? false
}

/** Calls `listener` when the visitor answers; answers how to stop. */
export function onConsentAnswer(listener: () => void): () => void {
    return visitors()?.onAnswer(listener) ?? (() => {})
}
