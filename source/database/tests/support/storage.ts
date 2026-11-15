import type { Storage } from "../../storage"

/**
 * The Storage bucket in memory, for a test to put on `c` in place of the
 * app's (`c.set("storage", ...)`): each key's body and content type in
 * `files`, and `fail()` makes the next put throw, like a bucket that's
 * down.
 */
export function memoryStorage() {
    const files = new Map<
        string,
        { body: string | Uint8Array; content_type: string }
    >()
    let failing = false

    const storage: Storage = {
        async put(key, body, content_type) {
            if (failing) {
                failing = false
                throw new Error("Storage is unavailable")
            } else {
                files.set(key, { body, content_type })
            }
        },
        async get(key) {
            const body = files.get(key)?.body
            if (body === undefined) {
                return null
            } else if (typeof body === "string") {
                return body
            } else {
                return new TextDecoder().decode(body)
            }
        }
    }

    return {
        storage,
        files,
        fail() {
            failing = true
        }
    }
}
