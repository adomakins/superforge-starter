import { INFRA_URL } from "@/utilities/infra"
import { rejectionError } from "./describe"
import { KEYS } from "./device"
import type { Batch } from "./queue"
import type { Recorder, Send } from "./record"

// The recorder (record.ts) wired to the page: the router's pages, the
// scrolling, the page hiding and coming back, the clicks and the errors,
// and the call to Infra. Only ever runs in a browser, from index.ts's
// `startVisitors`, which an effect calls, so never in the prerender.

/** The router, as far as the script needs it: when it's resolved a page. */
export type VisitorsRouter = {
    subscribe(
        type: "onResolved",
        listener: (event: { toLocation: { pathname: string } }) => void
    ): () => void
}

// What a click is counted on: the closest of these to what was clicked
const CLICKABLE = "a, button, [role=button], [data-track]"

// A form's fields, whose text is never kept
const FIELDS = "input, textarea, select, [contenteditable]"

/**
 * Sends a batch to the project's events on Infra, as plain text, which a
 * browser sends to another site without asking it first. Never
 * `navigator.sendBeacon`, which ad blockers refuse to another site. In a
 * dev server it sends nothing, and logs the batch instead.
 */
export function sender(project_id: string, development: boolean): Send {
    if (development) {
        return async (batch: Batch) => {
            console.debug("Visitors: what a build would send to Infra", batch)
            return 200
        }
    }
    const address = `${INFRA_URL}/projects/${project_id}/events`
    return async (batch, keepalive) => {
        try {
            const response = await fetch(address, {
                method: "POST",
                headers: { "Content-Type": "text/plain" },
                body: JSON.stringify(batch),
                keepalive,
                credentials: "omit"
            })
            return response.status
        } catch (error) {
            // Offline, blocked, or an answer the page can't read
            console.debug("Visitors: Infra didn't answer", { error })
            return null
        }
    }
}

/**
 * Wires `visitors` to this page, and records the page it landed on.
 * Answers how to unwire it.
 */
export function listen(visitors: Recorder, router: VisitorsRouter) {
    visitors.begin({
        path: window.location.pathname,
        url: window.location.href,
        referrer: document.referrer,
        visible: document.visibilityState === "visible"
    })

    let frame = 0
    // How far down the page is scrolled, once per frame at most
    function measure() {
        if (frame === 0) {
            frame = requestAnimationFrame(() => {
                frame = 0
                visitors.scrolled(scrollDepth())
            })
        }
    }
    measure()

    const unsubscribe = router.subscribe("onResolved", (event) => {
        guarded(() => {
            visitors.navigated(event.toLocation.pathname)
            measure()
        })
    })

    const listeners: [EventTarget, string, (event: Event) => void][] = [
        [window, "scroll", measure],
        [
            document,
            "visibilitychange",
            () => {
                if (document.visibilityState === "hidden") {
                    visitors.hidden()
                } else {
                    visitors.shown()
                }
            }
        ],
        [window, "pagehide", () => visitors.hidden()],
        [
            window,
            "pageshow",
            (event) => {
                // Back from the browser's cache, as it was left
                if (event instanceof PageTransitionEvent && event.persisted) {
                    visitors.shown()
                }
            }
        ],
        [document, "click", (event) => clicked(visitors, event)],
        [
            window,
            "storage",
            (event) => {
                // Another tab answered the banner, or the site's data was
                // cleared
                if (
                    event instanceof StorageEvent &&
                    (event.key === null || event.key === KEYS.consent)
                ) {
                    visitors.storageChanged()
                }
            }
        ],
        [
            window,
            "error",
            (event) => {
                if (event instanceof ErrorEvent) {
                    visitors.failed({
                        message: event.message,
                        source: event.filename === "" ? null : event.filename,
                        line: event.lineno === 0 ? null : event.lineno,
                        column: event.colno === 0 ? null : event.colno
                    })
                }
            }
        ],
        [
            window,
            "unhandledrejection",
            (event) => {
                if (event instanceof PromiseRejectionEvent) {
                    visitors.failed(rejectionError(event.reason))
                }
            }
        ]
    ]
    // Each wrapped, so the script never breaks the page, nor reports its
    // own error as the page's
    const wired = listeners.map(([target, type, listener]) => {
        const handler = (event: Event) => guarded(() => listener(event))
        target.addEventListener(type, handler, { capture: true, passive: true })
        return () =>
            target.removeEventListener(type, handler, { capture: true })
    })

    return () => {
        unsubscribe()
        for (const unwire of wired) {
            unwire()
        }
        cancelAnimationFrame(frame)
        frame = 0
    }
}

// Runs `run`, logging what it throws rather than letting it reach the page
function guarded(run: () => void) {
    try {
        run()
    } catch (error) {
        console.debug("Visitors: a listener threw", { error })
    }
}

// How far down the page the bottom of the window is, 0 to 100: all of it
// for a page that doesn't scroll
function scrollDepth() {
    const height = document.documentElement.scrollHeight
    if (height <= 0) {
        return 100
    } else {
        return ((window.scrollY + window.innerHeight) / height) * 100
    }
}

// A click on a link, a button, or anything named with `data-track`: what
// it is, never what's typed in a field
function clicked(visitors: Recorder, event: Event) {
    if (!(event.target instanceof Element)) {
        return
    }
    const element = event.target.closest(CLICKABLE)
    if (element === null) {
        return
    }
    const tag = element.tagName.toLowerCase()
    visitors.clicked(
        {
            tag,
            name: element.getAttribute("data-track"),
            label: element.getAttribute("aria-label"),
            text: element.textContent ?? "",
            href: tag === "a" ? element.getAttribute("href") : null,
            private:
                element.matches(FIELDS) ||
                element.closest("[data-private]") !== null
        },
        window.location.href
    )
}
