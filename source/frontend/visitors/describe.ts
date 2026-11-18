import type { EventProperties } from "@/utilities/schemas/events"

// What an event says about the page, from what the browser tells the
// script: the path, where a visitor came from, what they clicked and what
// went wrong. Nothing here touches the page itself (browser.ts does), so
// the tests run it in Node. A query string or a fragment can hold a token
// or an address, so none is ever kept, and neither is anything shaped like
// an email address.

/** The longest a click's text is kept. */
const LONGEST_TEXT = 80

/** The longest an error's message is kept. */
const LONGEST_MESSAGE = 500

/** The longest a campaign's name, from the address, is kept. */
const LONGEST_CAMPAIGN = 200

/** The longest a click's name, its `data-track`, is kept. */
const LONGEST_NAME = 64

/** The campaign's parameters a landing's address can carry. */
const CAMPAIGN = ["utm_source", "utm_medium", "utm_campaign"] as const

/**
 * A page's path as Infra takes it: from `/`, at most 2,048 characters,
 * with no query or fragment.
 */
export function pagePath(pathname: string) {
    const [path = ""] = pathname.split(/[?#]/)
    if (path.startsWith("/")) {
        return path.slice(0, 2048)
    } else {
        return `/${path}`.slice(0, 2048)
    }
}

/**
 * Free text as an event keeps it: on one line, every email address left
 * out, every web address without its query or fragment, and at most
 * `longest` characters.
 */
export function scrub(text: string, longest: number) {
    return text
        .replace(/\S+@\S+\.\S+/g, "[email]")
        .replace(/(https?:\/\/[^\s?#]+)[?#]\S*/g, "$1")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, longest)
        .trimEnd()
}

// A hostname without a leading `www.`, so a site's two names are one
function siteOf(hostname: string) {
    return hostname.replace(/^www\./, "")
}

// An address, read against `base` when it's relative, or null when it
// isn't one. Not `URL.canParse`, which older browsers lack.
function parsedUrl(text: string, base?: string) {
    try {
        return new URL(text, base)
    } catch (error) {
        console.debug("Visitors: not an address", { text, error })
        return null
    }
}

/**
 * What the first view of a visit to the site says about where the visitor
 * came from: `referrer`, the other site's hostname, never one of this
 * site's own pages, and the campaign in the address it landed on
 * (`utm_source`, `utm_medium`, `utm_campaign`).
 */
export function landingProperties({
    url,
    referrer
}: {
    // The address the page landed on
    url: string
    // `document.referrer`: the page before, or empty
    referrer: string
}): EventProperties {
    const properties: EventProperties = {}
    const landed = parsedUrl(url)
    const from = referrer === "" ? null : parsedUrl(referrer)
    if (
        from !== null &&
        (from.protocol === "http:" || from.protocol === "https:") &&
        (landed === null || siteOf(from.hostname) !== siteOf(landed.hostname))
    ) {
        properties.referrer = from.hostname
    }
    for (const parameter of CAMPAIGN) {
        const value = landed?.searchParams.get(parameter)?.trim()
        if (value !== undefined && value !== "") {
            properties[parameter] = scrub(value, LONGEST_CAMPAIGN)
        }
    }
    return properties
}

/** What the script reads off an element a visitor clicked (browser.ts). */
export type ClickedElement = {
    // Its tag, lowercase: `a`, `button`, or whatever has `role="button"`
    tag: string
    // Its `data-track`, the name the app gave the click, or null
    name: string | null
    // Its `aria-label`, its name when it shows no text, like an icon's
    label: string | null
    // The text it shows
    text: string
    // A link's `href`, as written, or null for anything else
    href: string | null
    // Whether it may show something private, so its text isn't kept: it's
    // a form's field, or inside `data-private`, as the dashboard is
    private: boolean
}

/**
 * A click's properties: `target`, the element's `data-track` or else its
 * tag; `text`, its label or what it shows, scrubbed, unless it's private;
 * and for a link, `href`: the path on this site, the address without its
 * query on another, or only the scheme of anything else, like `mailto:`.
 */
export function clickProperties(
    element: ClickedElement,
    page_url: string
): EventProperties {
    const name = scrub(element.name ?? "", LONGEST_NAME)
    const properties: EventProperties = {
        target: name === "" ? element.tag : name
    }
    const text = scrub(element.label ?? element.text, LONGEST_TEXT)
    if (!element.private && text !== "") {
        properties.text = text
    }
    const to = element.href === null ? null : parsedUrl(element.href, page_url)
    if (to === null) {
        return properties
    } else if (to.protocol !== "http:" && to.protocol !== "https:") {
        properties.href = to.protocol
    } else if (to.origin === parsedUrl(page_url)?.origin) {
        properties.href = to.pathname
    } else {
        properties.href = `${to.origin}${to.pathname}`
    }
    return properties
}

/** What the script reads off an error (browser.ts). */
export type PageError = {
    message: string
    // The script's address, and where in it
    source: string | null
    line: number | null
    column: number | null
}

/**
 * An error's properties: `message`, scrubbed, and where it happened:
 * `source`, the script's address without its query, `line` and `column`.
 */
export function errorProperties(error: PageError): EventProperties {
    const message = scrub(error.message, LONGEST_MESSAGE)
    const properties: EventProperties = {
        message: message === "" ? "(no message)" : message
    }
    if (error.source !== null && error.source !== "") {
        properties.source = scrub(error.source, LONGEST_MESSAGE)
    }
    if (error.line !== null && Number.isFinite(error.line)) {
        properties.line = error.line
    }
    if (error.column !== null && Number.isFinite(error.column)) {
        properties.column = error.column
    }
    return properties
}

/**
 * A promise's rejection as an error: its message, and where it was thrown,
 * from the first line of its stack that names a script.
 */
export function rejectionError(reason: unknown): PageError {
    const message =
        reason instanceof Error
            ? `${reason.name}: ${reason.message}`
            : typeof reason === "string"
              ? reason
              : "A promise was rejected"
    const stack = reason instanceof Error ? (reason.stack ?? "") : ""
    const place = /(https?:\/\/[^\s)]+?):(\d+):(\d+)/.exec(stack)
    return {
        message,
        source: place?.[1] ?? null,
        line: place?.[2] === undefined ? null : Number(place[2]),
        column: place?.[3] === undefined ? null : Number(place[3])
    }
}
