import type { ObjectStore } from "../../storage"

/**
 * The Storage bucket's bytes in memory, for a test to hand `new Storage()`
 * (or a subclass with kinds of its own) and put on a route's `context` in place of the
 * app's: each key's bytes and content type in `files`, and `fail()` makes
 * the next put throw, like a bucket that's down.
 */
export function memoryStore() {
    const files = new Map<
        string,
        { body: Uint8Array<ArrayBuffer>; content_type: string }
    >()
    let failing = false

    const store: ObjectStore = {
        async put(key, body, content_type) {
            if (failing) {
                failing = false
                throw new Error("Storage is unavailable")
            } else if (typeof body === "string") {
                files.set(key, {
                    body: new TextEncoder().encode(body),
                    content_type
                })
            } else {
                files.set(key, { body: new Uint8Array(body), content_type })
            }
        },
        async get(key) {
            return files.get(key)?.body ?? null
        },
        async delete(key) {
            files.delete(key)
        }
    }

    return {
        store,
        files,
        fail() {
            failing = true
        }
    }
}
