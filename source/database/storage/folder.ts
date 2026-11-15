import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import type { Storage } from "."

/**
 * Files kept in a folder on this machine, for a dev server, which has no
 * credentials for Railway's bucket: each key a path under `directory`.
 */
export function folderStorage(directory: string): Storage {
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
                return await readFile(pathOf(key), "utf8")
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
        }
    }
}
