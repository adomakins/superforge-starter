import { createReadStream } from "node:fs"
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import type { ObjectStore } from "."

/**
 * Files kept in a folder on this machine, for a dev server, which has no
 * credentials for Railway's bucket: each key a path under `directory`.
 */
export function folderStore(directory: string): ObjectStore {
    function pathOf(key: string) {
        const parts = key.split("/")
        if (
            parts.some((part) => part === "" || part === "." || part === "..")
        ) {
            throw new Error(`A Storage key can't name a path like ${key}`)
        } else {
            return join(directory, ...parts)
        }
    }

    return {
        async put(key, body) {
            const path = pathOf(key)
            await mkdir(dirname(path), { recursive: true })
            await writeFile(path, body)
        },

        async get(key) {
            try {
                return new Uint8Array(await readFile(pathOf(key)))
            } catch (error) {
                if (
                    error instanceof Error &&
                    "code" in error &&
                    error.code === "ENOENT"
                ) {
                    return null
                } else {
                    console.error("A stored file couldn't be read", {
                        key,
                        error
                    })
                    throw error
                }
            }
        },

        async open(key, range) {
            const path = pathOf(key)
            const found = await stat(path).catch((error: unknown) => {
                if (
                    error instanceof Error &&
                    "code" in error &&
                    error.code === "ENOENT"
                ) {
                    return null
                } else {
                    console.error("A stored file couldn't be opened", {
                        key,
                        error
                    })
                    throw error
                }
            })
            if (found === null) {
                return { ok: false, error: "not-found" }
            }
            const size = found.size
            const start = range?.start ?? 0
            const end = Math.min(range?.end ?? size - 1, size - 1)
            if (start >= size && size > 0) {
                return { ok: false, error: "unsatisfiable" }
            } else {
                return {
                    ok: true,
                    data: {
                        body: streamOf(path, start, end),
                        size,
                        start,
                        end,
                        partial: range !== undefined
                    }
                }
            }
        },

        async delete(key) {
            await rm(pathOf(key), { force: true })
        }
    }
}

// A file's bytes from `start` to `end` inclusive, as a web stream, read a
// chunk at a time as the reader asks for more
function streamOf(path: string, start: number, end: number) {
    const file = createReadStream(path, { start, end })
    const chunks = file[Symbol.asyncIterator]()
    return new ReadableStream<Uint8Array>({
        async pull(controller) {
            const next = await chunks.next()
            if (next.done === true) {
                controller.close()
            } else {
                controller.enqueue(new Uint8Array(next.value))
            }
        },
        cancel() {
            file.destroy()
        }
    })
}
