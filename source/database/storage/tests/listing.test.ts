import { describe, expect, it } from "vitest"
import { pageLimit, pageOf } from "../listing"

const KEPT = new Date("2026-11-19T10:00:00Z")

// Files kept under each of `keys`, in the order given
function files(...keys: string[]) {
    return keys.map((key) => ({ key, size: 1, modified: KEPT }))
}

describe("a page of a listing, without a bucket", () => {
    it("lists in key order by bytes, as S3 does", () => {
        const page = pageOf(files("a/b", "a/😀", "a/A", "a/ﬀ"), "a/")

        expect(page.files.map((file) => file.key)).toEqual([
            "a/A",
            "a/b",
            "a/ﬀ",
            "a/😀"
        ])
    })

    it("rolls each folder's files up into it, counting it once on a page", () => {
        const kept = files("a/1", "a/b/1", "a/b/2", "a/c/1", "a/d")

        const first = pageOf(kept, "a/", { folders: true, limit: 2 })
        const second = pageOf(kept, "a/", {
            folders: true,
            limit: 2,
            cursor: first.cursor ?? undefined
        })

        expect(first).toEqual({
            files: files("a/1"),
            folders: ["a/b/"],
            cursor: "a/b/"
        })
        expect(second).toEqual({
            files: files("a/d"),
            folders: ["a/c/"],
            cursor: null
        })
        // Past the last name there's nothing
        expect(pageOf(kept, "a/", { folders: true, cursor: "a/d" })).toEqual({
            files: [],
            folders: [],
            cursor: null
        })
    })

    it("refuses a page that isn't 1 to 1,000", () => {
        expect(pageLimit()).toBe(1000)
        expect(() => pageLimit({ limit: 0 })).toThrow(
            "A listing's page holds 1 to 1000, not 0"
        )
        expect(() => pageLimit({ limit: 1001 })).toThrow()
        expect(() => pageLimit({ limit: 2.5 })).toThrow()
    })
})
