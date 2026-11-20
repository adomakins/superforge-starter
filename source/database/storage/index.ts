import { join } from "node:path"
import { z } from "zod"
import { type BucketConfiguration, bucketStore } from "./bucket"
import { Storage } from "./files"
import { folderStore } from "./folder"

// The `Storage` bucket (.railway/railway.ts), through `Storage` (./files.ts):
// every kind of file the app keeps, each in a folder of its own, filed under
// a key its kind checks. Underneath it is an `ObjectStore`, bytes under
// keys: Railway's bucket through its S3 API in a build. A dev server has no
// credentials for it, so it keeps files in a folder on this machine instead,
// and the tests keep them in memory (../tests/support/storage.ts).

export { Storage } from "./files"

/** Bytes kept under keys, which only `Files` (./kind.ts) uses. */
export type ObjectStore = {
    /** Keeps `body` under `key`, in place of whatever was kept there. */
    put(
        key: string,
        body: string | Uint8Array<ArrayBuffer>,
        content_type: string
    ): Promise<void>
    /** The bytes kept under `key`, or null when nothing is. */
    get(key: string): Promise<Uint8Array<ArrayBuffer> | null>
    /**
     * What's kept under `key` as it streams, all of it or the bytes in
     * `range`, without holding it in memory: for a large file sent on to a
     * browser, like a video, which asks for it a range at a time.
     */
    open(key: string, range?: ByteRange): AsyncOperation<Opened, OpenFailure>
    /** Deletes what's kept under `key`, if anything is. */
    delete(key: string): Promise<void>
}

/**
 * Some of a file's bytes, from `start` to `end` inclusive, as an HTTP Range
 * header asks for them. Without an `end`, to the end of the file.
 */
export type ByteRange = { start: number; end?: number }

/**
 * A file being read: its bytes from `start` to `end` inclusive, of `size`
 * in all, and whether that's only part of it (a range, honored).
 */
export type Opened = {
    body: ReadableStream<Uint8Array>
    size: number
    start: number
    end: number
    partial: boolean
}

/** Nothing is kept under the key, or the range starts past its end. */
export type OpenFailure = "not-found" | "unsatisfiable"

/**
 * Where a dev server keeps its files: `.storage/` in the checkout it runs
 * from, which git ignores. Each checkout has its own, as it has its own
 * Postgres.
 */
export const LOCAL_STORAGE_DIRECTORY = join(process.cwd(), ".storage")

let shared: Storage | undefined

/**
 * The server's storage: the bucket whose S3 credentials Railway sets as
 * `STORAGE_*`, or the folder on this machine in a dev server. Made the
 * first time it's asked for, without checking the credentials: a server
 * missing them still answers, and only what keeps a file fails, saying
 * why.
 */
export function appStorage(): Storage {
    if (shared === undefined) {
        shared = new Storage(
            import.meta.env.DEV
                ? folderStore(LOCAL_STORAGE_DIRECTORY)
                : bucketStore(() => bucketConfiguration())
        )
    }
    return shared
}

// The bucket's S3 credentials, as Railway sets them on the app's service
// (.railway/railway.ts), by their variables' names
const storage_environment = z.object({
    STORAGE_BUCKET: z.string().min(1),
    STORAGE_ENDPOINT: z.url(),
    STORAGE_REGION: z.string().min(1),
    STORAGE_ACCESS_KEY_ID: z.string().min(1),
    STORAGE_SECRET_ACCESS_KEY: z.string().min(1)
})

/**
 * The bucket's credentials, from the environment, parsed with its schema.
 * Throws naming each of its variables that's missing or wrong.
 */
export function bucketConfiguration(
    environment: Record<string, string | undefined> = process.env
): BucketConfiguration {
    const parsed = storage_environment.safeParse(environment)
    if (!parsed.success) {
        const names = parsed.error.issues.map((issue) => issue.path.join("."))
        throw new Error(
            `The Storage bucket can't be used, since these aren't set right: ${names.join(", ")}`
        )
    } else {
        const variables = parsed.data
        return {
            bucket: variables.STORAGE_BUCKET,
            endpoint: variables.STORAGE_ENDPOINT,
            region: variables.STORAGE_REGION,
            access_key_id: variables.STORAGE_ACCESS_KEY_ID,
            secret_access_key: variables.STORAGE_SECRET_ACCESS_KEY
        }
    }
}
