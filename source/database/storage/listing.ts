import type { ListedFile, Listing, ListOptions } from "."

// A page of a listing, as the bucket's S3 API answers one (ListObjectsV2),
// for the stores that keep every file at hand and list them themselves: a
// dev server's folder (./folder.ts) and the tests' memory
// (../tests/support/storage.ts). So a screen pages through either the way
// it pages through the bucket.

/** The most a page holds, and how many it holds when not asked: S3's. */
export const LONGEST_PAGE = 1000

/**
 * How many a page of `options` holds. Throws on a limit that isn't a whole
 * number from 1 to 1,000, which is a bug in the caller.
 */
export function pageLimit(options: ListOptions = {}): number {
    const limit = options.limit ?? LONGEST_PAGE
    if (!Number.isInteger(limit) || limit < 1 || limit > LONGEST_PAGE) {
        throw new Error(
            `A listing's page holds 1 to ${LONGEST_PAGE}, not ${limit}`
        )
    } else {
        return limit
    }
}

/**
 * The page of `files` (every file kept, in any order) that `prefix` and
 * `options` ask for. The cursor is the name of the last file or folder on
 * the page, so the next one starts after it.
 */
export function pageOf(
    files: ListedFile[],
    prefix: string,
    options: ListOptions = {}
): Listing {
    const limit = pageLimit(options)

    // Each file under the prefix, or with `folders`, the folder right under
    // the prefix it's in, once, by name, in key order as S3 lists them
    const entries = new Map<
        string,
        { kind: "file"; file: ListedFile } | { kind: "folder" }
    >()
    const under = files
        .filter((file) => file.key.startsWith(prefix))
        .sort((one, other) => compareKeys(one.key, other.key))
    for (const file of under) {
        const rest = file.key.slice(prefix.length)
        const slash = rest.indexOf("/")
        if (options.folders === true && slash !== -1) {
            entries.set(`${prefix}${rest.slice(0, slash + 1)}`, {
                kind: "folder"
            })
        } else {
            entries.set(file.key, { kind: "file", file })
        }
    }

    // The ones after the cursor, a page of them
    const after = [...entries].filter(
        ([name]) =>
            options.cursor === undefined ||
            compareKeys(name, options.cursor) > 0
    )
    const page = after.slice(0, limit)
    const last = page.at(-1)
    return {
        files: page.flatMap(([, entry]) =>
            entry.kind === "file" ? [entry.file] : []
        ),
        folders: page.flatMap(([name, entry]) =>
            entry.kind === "folder" ? [name] : []
        ),
        cursor: after.length > limit && last !== undefined ? last[0] : null
    }
}

// Keys in the order S3 lists them, by their UTF-8 bytes, which differs
// from JavaScript's own order for characters past U+FFFF
function compareKeys(one: string, other: string) {
    return Buffer.compare(Buffer.from(one), Buffer.from(other))
}
