import { MINUTE, SECOND } from "@/utilities/primitives/durations"
import {
    type EventProperties,
    event_name,
    event_properties
} from "@/utilities/schemas/events"
import type {
    PageBatch,
    PageEvent,
    VisitorConsent
} from "@/utilities/schemas/visits"
import {
    type ClickedElement,
    clickProperties,
    errorProperties,
    type Landing,
    landingProperties,
    type PageError,
    pagePath,
    viewProperties
} from "./describe"
import { KEEPALIVE_BYTES, queued, takeBatch } from "./queue"

// What happens on the site's pages, as events for the app's server to
// keep: a recorder for the page's life, which browser.ts feeds what the
// browser tells it. It keeps nothing on the device, only in the page's
// memory, and touches no page itself, only the clock and the senders it's
// handed, so the tests run it in Node. Who the visitor is, the server says
// (backend/visits/). README.md here has what's recorded.

/** How long the queue waits before it sends what's in it. */
export const SEND_EVERY = 5 * SECOND

/** The longest it waits between tries while the app's server is down. */
export const LONGEST_WAIT = 5 * MINUTE

/** The most errors a page sends, so one in a loop isn't sent forever. */
export const ERRORS_A_PAGE = 10

/** What the script sends on its own, which the app's events can't be named. */
const OWN_EVENTS = ["view", "leave", "click", "error"]

/**
 * What the app's server answered a batch: its status, and whether the page
 * asks the visitor before they're remembered, which only a 200 says; or
 * null when nothing answered.
 */
export type Sent = { status: number; ask: boolean } | null

/**
 * Sends one batch to the app's /api/visits. `keepalive` as the page hides,
 * so it goes after the page does.
 */
export type Send = (batch: PageBatch, keepalive: boolean) => Promise<Sent>

/**
 * Sends the visitor's answer to the banner to /api/visits/consent: whether
 * the server kept it.
 */
export type SendConsent = (consent: VisitorConsent) => Promise<boolean>

// The page being looked at, and what's been seen of it
type Page = {
    path: string
    // Whether its view has a leave still to come
    open: boolean
    // Since when it's been visible, or null while it's hidden
    visible_since: number | null
    // How far down it's been scrolled, 0 to 100
    deepest: number
    // How many of its errors were sent
    errors: number
}

export type Recorder = ReturnType<typeof recorder>

export function recorder({
    now,
    send,
    sendConsent
}: {
    now: () => number
    send: Send
    sendConsent: SendConsent
}) {
    let queue: PageEvent[] = []
    let page: Page | null = null
    let visible = true
    let failures = 0
    let sending = false
    let timer: ReturnType<typeof setTimeout> | null = null
    // Whether the banner asks the visitor, as the server's latest answer
    // said
    let asking = false
    // The visitor's answers to the banner on this page, counted as each is
    // given and again as each reaches the server, and how many are on
    // their way: the answer to a batch sent before the server knew can't
    // ask them again
    let answer_changes = 0
    let answers_on_the_way = 0
    const listeners = new Set<() => void>()

    // An event about the page now
    function add(name: string, properties: EventProperties) {
        queue = queued(queue, [
            { name, at: now(), path: page?.path ?? "/", properties }
        ])
        schedule(SEND_EVERY)
    }

    function view(path: string, properties: EventProperties) {
        page = {
            path: pagePath(path),
            open: true,
            visible_since: visible ? now() : null,
            deepest: 0,
            errors: 0
        }
        add("view", properties)
    }

    // The page's leave, once a view or a return to it: how far down it was
    // scrolled, and how long it was visible since
    function leave() {
        if (page === null || !page.open) {
            return
        }
        const visible_ms =
            page.visible_since === null ? 0 : now() - page.visible_since
        add("leave", { scroll: page.deepest, visible_ms })
        page.open = false
        page.visible_since = null
    }

    function schedule(wait: number) {
        if (timer === null && queue.length > 0) {
            timer = setTimeout(() => {
                timer = null
                void sendNext()
            }, wait)
        }
    }

    // How long to wait before the next try: longer after each that failed
    function waitAfterFailures() {
        return Math.min(SEND_EVERY * 2 ** failures, LONGEST_WAIT)
    }

    // Whether the banner asks, and the banner told when that changes
    function ask(now_asking: boolean) {
        if (asking !== now_asking) {
            asking = now_asking
            for (const listener of listeners) {
                listener()
            }
        }
    }

    // What a batch's answer means for it: sent, with whether to ask the
    // visitor unless they've answered since it went; refused and dropped
    // (a 4xx, which sending again won't change); or kept for another try
    // (no answer, or a 5xx, while the app's server is down or deploying)
    function settle(batch: PageEvent[], sent: Sent, answers_then: number) {
        if (sent !== null && sent.status >= 200 && sent.status < 300) {
            failures = 0
            if (answers_then === answer_changes && answers_on_the_way === 0) {
                ask(sent.ask)
            }
        } else if (sent !== null && sent.status >= 400 && sent.status < 500) {
            console.warn(
                "Visitors: the app's server refused the page's events",
                {
                    status: sent.status,
                    events: batch.length
                }
            )
            failures = 0
        } else {
            failures += 1
            queue = queued(batch, queue)
        }
        schedule(waitAfterFailures())
    }

    function dropOversized(oversized: PageEvent[]) {
        if (oversized.length > 0) {
            console.warn("Visitors: an event too big to send was dropped", {
                names: oversized.map((event) => event.name)
            })
        }
    }

    // Sends `batch`, and settles it once it's answered
    async function sendBatch(batch: PageEvent[], keepalive: boolean) {
        const answers_then = answer_changes
        const sent = await send(
            { sent_at: now(), events: batch },
            keepalive
        ).catch((error: unknown) => {
            console.debug("Visitors: sending threw", { error })
            return null
        })
        settle(batch, sent, answers_then)
    }

    // Sends the first batch waiting, one call at a time
    async function sendNext() {
        if (sending || queue.length === 0) {
            return
        }
        const { batch, oversized, rest } = takeBatch(queue)
        dropOversized(oversized)
        queue = rest
        if (batch.length === 0) {
            return
        }
        sending = true
        await sendBatch(batch, false)
        sending = false
    }

    // As the page hides, which may be the last the script runs: sends
    // what's waiting with `keepalive`, as much as a browser allows, even
    // while the server's been down, since there may be no later. What
    // can't go stays in memory, and goes if the page comes back.
    function sendAsPageHides() {
        if (timer !== null) {
            clearTimeout(timer)
            timer = null
        }
        let spent = 0
        while (queue.length > 0) {
            const { batch, bytes, oversized, rest } = takeBatch(queue)
            dropOversized(oversized)
            if (batch.length === 0) {
                queue = rest
            } else if (spent + bytes > KEEPALIVE_BYTES) {
                break
            } else {
                spent += bytes
                queue = rest
                void sendBatch(batch, true)
            }
        }
    }

    // A page the router resolved: the last one's leave and this one's
    // view, unless only its query or fragment changed
    function navigated(path: string, title: string) {
        if (page !== null && page.path === pagePath(path)) {
            return
        }
        leave()
        view(path, viewProperties(title))
    }

    return {
        /**
         * The page the visitor landed on: its view, with where they came
         * from and what on. Called again, as a dev server's strict mode
         * does, it only catches up with the path.
         */
        begin(landing: Landing & { path: string; visible: boolean }) {
            if (page !== null) {
                navigated(landing.path, landing.title)
                return
            }
            visible = landing.visible
            view(landing.path, landingProperties(landing))
        },

        /**
         * The router resolved a page, with this title: the last one's
         * leave and this one's view, unless only its query or fragment
         * changed.
         */
        navigated,

        /** How far down the page is scrolled now, 0 to 100. */
        scrolled(percent: number) {
            if (page !== null) {
                page.deepest = Math.max(
                    page.deepest,
                    Math.min(Math.max(Math.round(percent), 0), 100)
                )
            }
        },

        /** The page hid: its leave, and what's waiting sent. */
        hidden() {
            visible = false
            leave()
            sendAsPageHides()
        },

        /** The page came back: it's open again, and visible from now. */
        shown() {
            if (visible) {
                return
            }
            visible = true
            if (page !== null) {
                page.open = true
                page.visible_since = now()
            }
            schedule(SEND_EVERY)
        },

        /** A click on a link, a button or anything named with `data-track`. */
        clicked(element: ClickedElement, page_url: string) {
            add("click", clickProperties(element, page_url))
        },

        /** An error on the page: the first ten of each page's. */
        failed(error: PageError) {
            if (page !== null && page.errors >= ERRORS_A_PAGE) {
                return
            }
            if (page !== null) {
                page.errors += 1
            }
            add("error", errorProperties(error))
        },

        /** The app's own event (index.ts's `track`). */
        track(name: string, properties: EventProperties) {
            if (!event_name.safeParse(name).success) {
                console.warn(
                    "Visitors: an event's name is lowercase words joined by hyphens, at most 64 characters",
                    { name }
                )
            } else if (OWN_EVENTS.includes(name)) {
                console.warn("Visitors: the script sends this event itself", {
                    name
                })
            } else if (!event_properties.safeParse(properties).success) {
                console.warn(
                    "Visitors: an event's properties are at most 32, each a string of at most 1,000 characters, a number, a boolean or null",
                    { name }
                )
            } else {
                add(name, properties)
            }
        },

        /**
         * The visitor's answer to the banner, which hides it at once and
         * goes to the server, which keeps it in a cookie. Should the
         * server not keep it, the next batch's answer asks again.
         */
        answer(consent: VisitorConsent) {
            answer_changes += 1
            answers_on_the_way += 1
            ask(false)
            void sendConsent(consent)
                .catch((error: unknown) => {
                    console.debug("Visitors: sending the answer threw", {
                        error
                    })
                    return false
                })
                .then(() => {
                    answer_changes += 1
                    answers_on_the_way -= 1
                })
        },

        /** Whether the banner asks the visitor now. */
        asking() {
            return asking
        },

        /**
         * Calls `listener` when whether the banner asks changes; answers
         * how to stop.
         */
        onAskingChange(listener: () => void) {
            listeners.add(listener)
            return () => {
                listeners.delete(listener)
            }
        },

        /** Stops the timer, as a test's end does. */
        stop() {
            if (timer !== null) {
                clearTimeout(timer)
                timer = null
            }
        }
    }
}
