import { describe, expect, it } from "vitest"
import { z } from "zod"
import { memoryStore } from "@/database/tests/support/storage"
import { Storage } from ".."
import { Files, text } from "../kind"

// Each getter of `storage`'s that makes a kind, by its folder, whether or
// not `kinds` lists it: the getters are the kinds, and `kinds` is how a
// screen of the bucket's folders finds them, so the two must agree
function getters(storage: Storage) {
    const folders: string[] = []
    let prototype: unknown = Object.getPrototypeOf(storage)
    while (prototype !== null && prototype !== Object.prototype) {
        for (const [name, descriptor] of Object.entries(
            Object.getOwnPropertyDescriptors(prototype)
        )) {
            if (name !== "kinds" && descriptor.get !== undefined) {
                const made: unknown = descriptor.get.call(storage)
                if (made instanceof Files) {
                    folders.push(made.folder)
                }
            }
        }
        prototype = Object.getPrototypeOf(prototype)
    }
    return folders
}

// The kinds `storage` has as getters but leaves out of `kinds`
function unlisted(storage: Storage) {
    const listed = new Set(storage.kinds.map((kind) => kind.folder))
    return getters(storage).filter((folder) => !listed.has(folder))
}

describe("the app's kinds of file", () => {
    const storage = new Storage(memoryStore().store)

    it("lists every kind in kinds, once", () => {
        const folders = storage.kinds.map((kind) => kind.folder)

        expect(unlisted(storage)).toEqual([])
        expect(new Set(folders).size).toBe(folders.length)
    })

    it("keeps each kind in one folder at the top of the bucket", () => {
        for (const kind of storage.kinds) {
            expect(kind.folder).toMatch(/^[^/]+$/)
            expect([".", ".."]).not.toContain(kind.folder)
        }
    })

    it("says why each locked kind is locked", () => {
        for (const { shown } of storage.kinds) {
            expect(shown.name).not.toBe("")
            expect(shown.about).not.toBe("")
            if (shown.access === "locked") {
                expect(shown.why).not.toBe("")
            }
        }
    })

    it("finds a kind left out of kinds", () => {
        class Forgetful extends Storage {
            get notes() {
                return new Files(this.store, {
                    folder: "notes",
                    shown: { name: "Notes", about: "Notes.", access: "open" },
                    key: z.object({ name: z.string() }),
                    path: ({ name }) => `${name}.txt`,
                    content: text("text/plain")
                })
            }
        }

        expect(unlisted(new Forgetful(memoryStore().store))).toEqual(["notes"])
    })
})
