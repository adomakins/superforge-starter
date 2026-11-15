import { randomUUID } from "node:crypto"
import { describe, expect, it } from "vitest"
import { z } from "zod"
import { memoryStore } from "@/database/tests/support/storage"
import { Storage } from ".."
import { bytes, Files, json, text } from "../kind"

// Storage with a kind of file in each format, added the way files.ts adds
// them, and one whose key doesn't check its parts, to show the path check
class SampleStorage extends Storage {
    get invoices() {
        return new Files(this.store, {
            folder: "invoices",
            key: z.object({ customer_id: z.uuid(), invoice_id: z.uuid() }),
            path: ({ customer_id, invoice_id }) =>
                `${customer_id}/${invoice_id}.pdf`,
            content: bytes("application/pdf")
        })
    }

    get receipts() {
        return new Files(this.store, {
            folder: "receipts",
            key: z.object({ order_id: z.uuid() }),
            path: ({ order_id }) => `${order_id}.json`,
            content: json(
                z.object({ total: z.number(), items: z.array(z.string()) })
            )
        })
    }

    get pages() {
        return new Files(this.store, {
            folder: "pages",
            key: z.object({ slug: z.string().regex(/^[a-z0-9-]+$/) }),
            path: ({ slug }) => `${slug}.html`,
            content: text("text/html; charset=utf-8")
        })
    }

    get drafts() {
        return new Files(this.store, {
            folder: "drafts",
            key: z.object({ name: z.string() }),
            path: ({ name }) => `${name}/draft.txt`,
            content: text("text/plain; charset=utf-8")
        })
    }
}

function sample() {
    const memory = memoryStore()
    return { storage: new SampleStorage(memory.store), memory }
}

describe("Storage's kinds of file", () => {
    it("files each one at the path its key makes, with its kind's content type", async () => {
        const { storage, memory } = sample()
        const order_id = randomUUID()

        const path = await storage.receipts.put(
            { order_id },
            { total: 12, items: ["Tint"] }
        )

        expect(path).toBe(`receipts/${order_id}.json`)
        expect(memory.files.get(path)?.content_type).toBe("application/json")
        expect(await storage.receipts.get({ order_id })).toEqual({
            total: 12,
            items: ["Tint"]
        })
    })

    it("gives back bytes and text as they were kept", async () => {
        const { storage } = sample()
        const key = { customer_id: randomUUID(), invoice_id: randomUUID() }
        const pdf = new Uint8Array([37, 80, 68, 70, 0, 255])

        await storage.invoices.put(key, pdf)
        await storage.pages.put({ slug: "about" }, "<h1>About</h1>")

        expect(await storage.invoices.get(key)).toEqual(pdf)
        expect(await storage.pages.get({ slug: "about" })).toBe(
            "<h1>About</h1>"
        )
    })

    it("reads a key with no file as null, and deletes one", async () => {
        const { storage } = sample()

        await storage.pages.put({ slug: "about" }, "<h1>About</h1>")
        await storage.pages.delete({ slug: "about" })

        expect(await storage.pages.get({ slug: "about" })).toBeNull()
        expect(await storage.pages.get({ slug: "never-kept" })).toBeNull()
    })

    it("refuses a key that doesn't fit its kind, before anything is kept", async () => {
        const { storage, memory } = sample()

        await expect(
            storage.invoices.put(
                { customer_id: "../other", invoice_id: randomUUID() },
                new Uint8Array()
            )
        ).rejects.toThrow()
        await expect(
            storage.pages.put({ slug: "a/b" }, "<h1>B</h1>")
        ).rejects.toThrow()

        expect(memory.files.size).toBe(0)
    })

    it("refuses a path with an empty, . or .. part, however the key got through", async () => {
        const { storage, memory } = sample()

        await expect(storage.drafts.put({ name: ".." }, "Hi")).rejects.toThrow(
            "A drafts key made the path drafts/../draft.txt"
        )
        await expect(storage.drafts.put({ name: "" }, "Hi")).rejects.toThrow()

        expect(memory.files.size).toBe(0)
    })

    it("refuses a JSON document that doesn't fit its kind's schema", async () => {
        const { storage, memory } = sample()
        // As a body from outside the types would come, untyped
        const body = JSON.parse('{ "total": "12", "items": [] }')

        await expect(
            storage.receipts.put({ order_id: randomUUID() }, body)
        ).rejects.toThrow()

        expect(memory.files.size).toBe(0)
    })

    it("throws, naming the file, when one kept no longer fits its schema", async () => {
        const { storage, memory } = sample()
        const order_id = randomUUID()
        await memory.store.put(
            `receipts/${order_id}.json`,
            '{ "total": "12" }',
            "application/json"
        )

        await expect(storage.receipts.get({ order_id })).rejects.toThrow(
            `receipts/${order_id}.json doesn't hold what its kind says`
        )
    })
})
