import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterAll, describe, expect, it } from "vitest"
import type { ObjectStore } from ".."
import { folderStore } from "../folder"

// What's kept under `key`, as text
async function read(storage: ObjectStore, key: string) {
    const kept = await storage.get(key)
    if (kept === null) {
        return null
    } else {
        return new TextDecoder().decode(kept)
    }
}

const made: string[] = []
afterAll(async () => {
    await Promise.all(
        made.map((directory) => rm(directory, { recursive: true }))
    )
})

async function folder() {
    const directory = await mkdtemp(join(tmpdir(), "storage-"))
    made.push(directory)
    return { storage: folderStore(directory), directory }
}

describe("a dev server's storage", () => {
    it("keeps each key as a file under its folder", async () => {
        const { storage, directory } = await folder()

        await storage.put("invoices/customer-1/invoice-1", "<p>Hi</p>", "")

        expect(
            await readFile(
                join(directory, "invoices", "customer-1", "invoice-1"),
                "utf8"
            )
        ).toBe("<p>Hi</p>")
        expect(await read(storage, "invoices/customer-1/invoice-1")).toBe(
            "<p>Hi</p>"
        )
        expect(await read(storage, "invoices/customer-1/invoice-2")).toBeNull()
    })

    it("keeps a file's bytes as they came", async () => {
        const { storage, directory } = await folder()
        const bytes = new Uint8Array([0, 255, 137, 80])

        await storage.put("uploads/one/1.png", bytes, "image/png")

        expect(
            new Uint8Array(
                await readFile(join(directory, "uploads", "one", "1.png"))
            )
        ).toEqual(bytes)
    })

    it("deletes a key's file, and a key that holds nothing too", async () => {
        const { storage } = await folder()
        await storage.put("invoices/a", "<p>A</p>", "text/html")

        await storage.delete("invoices/a")
        await storage.delete("invoices/a")

        expect(await read(storage, "invoices/a")).toBeNull()
    })

    it("refuses a key that would leave its folder", async () => {
        const { storage } = await folder()

        await expect(storage.put("../outside", "", "")).rejects.toThrow(
            "A Storage key can't name a path like ../outside"
        )
    })
})
