import type { z } from "zod"

// What the pages keep on a visitor's device, in localStorage: their answer
// to the banner, and, only once they've accepted it (consent.ts), their
// browser's lasting ID, their visit's, and the events that couldn't be
// sent yet. Each is read back with zod, since an older version of this
// script may have written it.

/** localStorage, or a stand-in for it: what the pages read and write. */
export type DeviceStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">

/** Where each thing is kept. */
export const KEYS = {
    consent: "visitors.consent",
    visitor: "visitors.visitor",
    session: "visitors.session",
    waiting: "visitors.waiting"
} as const

type Key = (typeof KEYS)[keyof typeof KEYS]

/**
 * What's kept under `key`, as `schema` reads it, or null when there's
 * nothing, it doesn't fit, or the browser refuses to read.
 */
export function readStored<Schema extends z.ZodType>(
    storage: DeviceStorage,
    key: Key,
    schema: Schema
): z.output<Schema> | null {
    let text: string | null
    try {
        text = storage.getItem(key)
    } catch (error) {
        console.debug("Visitors: the browser refused to read", { key, error })
        return null
    }
    if (text === null) {
        return null
    }
    let value: unknown
    try {
        value = JSON.parse(text)
    } catch (error) {
        console.debug("Visitors: what was kept isn't JSON", { key, error })
        return null
    }
    const parsed = schema.safeParse(value)
    if (parsed.success) {
        return parsed.data
    } else {
        return null
    }
}

/**
 * Keeps `value` under `key`, as JSON, unless the browser refuses. Answers
 * whether it was kept.
 */
export function writeStored(storage: DeviceStorage, key: Key, value: unknown) {
    try {
        storage.setItem(key, JSON.stringify(value))
        return true
    } catch (error) {
        // Full, or refused, as a private window can: nothing is kept
        console.debug("Visitors: the browser refused to keep", { key, error })
        return false
    }
}

/** Forgets what's kept under `key`. */
export function removeStored(storage: DeviceStorage, key: Key) {
    try {
        storage.removeItem(key)
    } catch (error) {
        console.debug("Visitors: the browser refused to forget", { key, error })
    }
}

/**
 * The browser's localStorage, or null where even asking for it throws, as
 * it does with a site's storage blocked. Nothing is written to find out.
 */
export function deviceStorage(): DeviceStorage | null {
    try {
        return window.localStorage
    } catch (error) {
        console.debug("Visitors: no localStorage", { error })
        return null
    }
}

/**
 * Storage that lasts as long as the page: what the tests hand the script,
 * and what it uses where localStorage is blocked.
 */
export function memoryStorage(): DeviceStorage & {
    items: Map<string, string>
} {
    const items = new Map<string, string>()
    return {
        items,
        getItem: (key) => items.get(key) ?? null,
        setItem: (key, value) => {
            items.set(key, value)
        },
        removeItem: (key) => {
            items.delete(key)
        }
    }
}
