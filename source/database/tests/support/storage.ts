import type { ObjectStore } from "../../storage"
import { pageOf } from "../../storage/listing"

/**
 * The Storage bucket's bytes in memory, for a test to hand `new Storage()`
 * (or a subclass with kinds of its own) and put on a route's `context` in place of the
 * app's: each key's bytes, content type and when it was kept in `files`,
 * and `fail()` makes the next put throw, like a bucket that's down.
 *
 * It presigns as the bucket does, with links that only name what they were
 * for (`https://bucket.test/<key>?expires=…`), so a test reads what a
 * route handed out, then does what the browser would to `files` itself.
 * With `presigns: false` it can't, as a dev server's folder can't.
 */
export function memoryStore(options: { presigns?: boolean } = {}) {
    const presigns = options.presigns ?? true
    const files = new Map<
        string,
        { body: Uint8Array<ArrayBuffer>; content_type: string; modified: Date }
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
                    content_type,
                    modified: new Date()
                })
            } else {
                files.set(key, {
                    body: new Uint8Array(body),
                    content_type,
                    modified: new Date()
                })
            }
        },
        async get(key) {
            return files.get(key)?.body ?? null
        },
        async open(key, range) {
            const file = files.get(key)
            if (file === undefined) {
                return { ok: false, error: "not-found" }
            }
            const size = file.body.length
            const start = range?.start ?? 0
            const end = Math.min(range?.end ?? size - 1, size - 1)
            if (start >= size && size > 0) {
                return { ok: false, error: "unsatisfiable" }
            } else {
                const bytes = file.body.slice(start, end + 1)
                return {
                    ok: true,
                    data: {
                        body: new ReadableStream({
                            start(controller) {
                                controller.enqueue(bytes)
                                controller.close()
                            }
                        }),
                        size,
                        start,
                        end,
                        partial: range !== undefined
                    }
                }
            }
        },
        async delete(key) {
            files.delete(key)
        },
        async list(prefix, options) {
            return pageOf(
                [...files].map(([key, file]) => ({
                    key,
                    size: file.body.length,
                    modified: file.modified
                })),
                prefix,
                options
            )
        },
        async head(key) {
            const file = files.get(key)
            if (file === undefined) {
                return null
            } else {
                return {
                    size: file.body.length,
                    content_type: file.content_type,
                    modified: file.modified
                }
            }
        },
        async presignGet(key, { seconds, download }) {
            if (!presigns) {
                return { ok: false, error: "not-presignable" }
            } else {
                const link = new URL(`https://bucket.test/${key}`)
                link.searchParams.set("expires", String(seconds))
                if (download !== undefined) {
                    link.searchParams.set("download", download)
                }
                return { ok: true, data: link.href }
            }
        },
        async presignPost(key, { seconds, content_type, max_bytes }) {
            if (!presigns) {
                return { ok: false, error: "not-presignable" }
            } else {
                return {
                    ok: true,
                    data: {
                        url: "https://bucket.test/",
                        fields: {
                            key,
                            "Content-Type": content_type,
                            expires: String(seconds),
                            max_bytes: String(max_bytes)
                        }
                    }
                }
            }
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
