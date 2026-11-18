import { MINUTE, SECOND } from "@/utilities/primitives/durations"
import {
    app_user_id,
    type EventProperties,
    event_name,
    event_properties
} from "@/utilities/schemas/events"
import {
    asking,
    type ConsentAnswer,
    type ConsentSetting,
    consent_answer,
    remembering
} from "./consent"
import {
    type ClickedElement,
    clickProperties,
    errorProperties,
    landingProperties,
    type PageError,
    pagePath
} from "./describe"
import {
    type DeviceStorage,
    KEYS,
    readStored,
    removeStored,
    writeStored
} from "./device"
import {
    type Batch,
    KEEPALIVE_BYTES,
    keepWaiting,
    type PageEvent,
    queued,
    takeBatch,
    takeWaiting
} from "./queue"
import { sessionId, visitorId } from "./session"

// What happens on the site's pages, as events for Infra: a recorder for
// the page's life, which browser.ts feeds what the browser tells it. It
// touches no page itself, only the storage, the clock and the sender it's
// handed, so the tests run it in Node. README.md here has what's recorded.

/** How long the queue waits before it sends what's in it. */
export const SEND_EVERY = 5 * SECOND

/** The longest it waits between tries while Infra or the network is down. */
export const LONGEST_WAIT = 5 * MINUTE

/** The most errors a page sends, so one in a loop isn't sent forever. */
export const ERRORS_A_PAGE = 10

/** What the script sends on its own, which the app's events can't be named. */
const OWN_EVENTS = ["view", "leave", "click", "error"]

/** What's sent of a visitor who hasn't agreed to be remembered. */
const ANONYMOUS_EVENTS = ["view", "leave", "error"]

/**
 * Sends one batch to Infra: the answer's status, or null when nothing
 * answered. `keepalive` as the page hides, so it goes after the page does.
 */
export type Send = (batch: Batch, keepalive: boolean) => Promise<number | null>

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
    setting,
    storage,
    now,
    send
}: {
    setting: ConsentSetting
    storage: DeviceStorage
    now: () => number
    send: Send
}) {
    // The visitor's answer, when the device refused to keep it: otherwise
    // it's read from the device each time, so an answer in another of the
    // site's tabs, or the site's data cleared, holds here at once
    let unkept_answer: ConsentAnswer | null = null
    let user: string | null = null
    let queue: PageEvent[] = []
    let page: Page | null = null
    let visible = true
    let failures = 0
    let sending = false
    let timer: ReturnType<typeof setTimeout> | null = null
    const listeners = new Set<() => void>()

    function currentAnswer() {
        return (
            readStored(storage, KEYS.consent, consent_answer) ?? unkept_answer
        )
    }

    function remembered() {
        return remembering(setting, currentAnswer())
    }

    // Once a visitor declines: everything kept on the device but their
    // answer is forgotten, and what's waiting loses its IDs, its clicks and
    // the app's own events
    function forget() {
        removeStored(storage, KEYS.visitor)
        removeStored(storage, KEYS.session)
        removeStored(storage, KEYS.waiting)
        queue = queue
            .filter((event) => ANONYMOUS_EVENTS.includes(event.name))
            .map(({ name, at, path, properties }) => ({
                name,
                at,
                path,
                properties
            }))
    }

    // An event about the page now, with the IDs when the visitor may be
    // remembered, and none when they may not, when it's one of the few
    // sent then at all. `active` is false for a leave, which belongs to
    // the visit it ends rather than keeping one going.
    function add(name: string, properties: EventProperties, active = true) {
        const at = now()
        const event: PageEvent = {
            name,
            at,
            path: page?.path ?? "/",
            properties
        }
        if (remembered()) {
            event.visitor = visitorId(storage)
            event.session = sessionId(storage, at, active)
            if (user !== null) {
                event.user = user
            }
        } else if (!ANONYMOUS_EVENTS.includes(name)) {
            return
        }
        queue = queued(queue, [event])
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
        add("leave", { scroll: page.deepest, visible_ms }, false)
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

    // What a batch's answer means for it: sent, refused and dropped (a
    // 4xx, which sending again won't change), or kept for another try (no
    // answer, or a 5xx)
    function settle(batch: PageEvent[], status: number | null) {
        if (status !== null && status >= 200 && status < 300) {
            failures = 0
        } else if (status !== null && status >= 400 && status < 500) {
            console.warn("Visitors: Infra refused the page's events", {
                status,
                events: batch.length
            })
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
        const status = await send(
            { sent_at: now(), events: batch },
            false
        ).catch((error: unknown) => {
            console.debug("Visitors: sending threw", { error })
            return null
        })
        sending = false
        settle(batch, status)
    }

    // As the page hides, which may be the last the script runs: sends
    // what's waiting with `keepalive`, as much as a browser allows. With
    // the visitor's agreement, what can't go now (the rest, or all of it
    // while Infra or the network is down) is kept on the device for the
    // site's next page; without it, it stays in memory, and goes if the
    // page comes back.
    function sendAsPageHides() {
        if (timer !== null) {
            clearTimeout(timer)
            timer = null
        }
        if (failures > 0 && remembered()) {
            keepWaiting(storage, queue, now())
            queue = []
            return
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
                void send({ sent_at: now(), events: batch }, true)
                    .catch((error: unknown) => {
                        console.debug("Visitors: sending threw", { error })
                        return null
                    })
                    .then((status) => settle(batch, status))
            }
        }
        if (queue.length > 0 && remembered()) {
            keepWaiting(storage, queue, now())
            queue = []
        }
    }

    // A page the router resolved: the last one's leave and this one's
    // view, unless only its query or fragment changed
    function navigated(path: string) {
        if (page !== null && page.path === pagePath(path)) {
            return
        }
        leave()
        view(path, {})
    }

    function notify() {
        for (const listener of listeners) {
            listener()
        }
    }

    return {
        /**
         * The page the visitor landed on: its view, with where they came
         * from. Called again, as a dev server's strict mode does, it only
         * catches up with the path.
         */
        begin(landing: {
            path: string
            url: string
            referrer: string
            visible: boolean
        }) {
            if (page !== null) {
                navigated(landing.path)
                return
            }
            visible = landing.visible
            if (remembered()) {
                queue = queued(takeWaiting(storage, now()), queue)
            }
            view(landing.path, landingProperties(landing))
        },

        /**
         * The router resolved a page: the last one's leave and this one's
         * view, unless only its query or fragment changed.
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
            if (remembered()) {
                queue = queued(takeWaiting(storage, now()), queue)
                schedule(SEND_EVERY)
            }
        },

        /** A click, sent only of a visitor who agreed to be remembered. */
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

        /** Who's signed in, by the app's own ID, or null once they're not. */
        identify(user_id: string | null) {
            const parsed = app_user_id.safeParse(user_id)
            if (user_id !== null && !parsed.success) {
                console.warn(
                    "Visitors: a user is the app's own ID for them, never an email"
                )
            }
            user = parsed.success ? parsed.data : null
        },

        /**
         * The visitor's answer to the banner, kept so they aren't asked
         * again. Declining forgets everything else kept on the device, and
         * what's waiting loses its IDs and its clicks and app events.
         */
        answer(given: ConsentAnswer) {
            const kept = writeStored(storage, KEYS.consent, given)
            unkept_answer = kept ? null : given
            if (given === "declined") {
                forget()
            }
            notify()
        },

        /**
         * Another of the site's tabs changed what's kept, as answering the
         * banner there does: this one follows its answer.
         */
        storageChanged() {
            if (currentAnswer() === "declined") {
                forget()
            }
            notify()
        },

        /** Whether the banner asks this visitor. */
        asking() {
            return asking(setting, currentAnswer())
        },

        /** Calls `listener` when the visitor answers; answers how to stop. */
        onAnswer(listener: () => void) {
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
