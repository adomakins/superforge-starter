import { join } from "node:path"
import { bucketStorage } from "./bucket"
import { folderStorage } from "./folder"

// The `Storage` bucket (.railway/railway.ts): every file the app keeps, in
// one bucket with a folder for each kind of file, like
// `invoices/<customer id>/<invoice id>.pdf`. Nothing keeps a file yet. A
// build reaches Railway's bucket through its S3 API. A dev server has no
// credentials for it, so it keeps files in a folder on this machine
// instead, and the tests keep them in memory
// (../tests/support/storage.ts).

export type Storage = {
    /** Keeps `body` under `key`, in place of whatever was kept there. */
    put(
        key: string,
        body: string | Uint8Array<ArrayBuffer>,
        content_type: string
    ): Promise<void>
    /** The text kept under `key`, or null when nothing is. */
    get(key: string): Promise<string | null>
}

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
        shared = import.meta.env.DEV
            ? folderStorage(LOCAL_STORAGE_DIRECTORY)
            : bucketStorage(() => ({
                  bucket: variable("STORAGE_BUCKET"),
                  endpoint: variable("STORAGE_ENDPOINT"),
                  region: variable("STORAGE_REGION"),
                  access_key_id: variable("STORAGE_ACCESS_KEY_ID"),
                  secret_access_key: variable("STORAGE_SECRET_ACCESS_KEY")
              }))
    }
    return shared
}

function variable(name: string): string {
    const value = process.env[name]
    if (value === undefined || value === "") {
        throw new Error(
            `${name} isn't set, so the Storage bucket can't be used`
        )
    } else {
        return value
    }
}
