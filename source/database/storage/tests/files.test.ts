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
            shown: {
                name: "Invoices",
                about: "Each invoice sent, as the customer got it.",
                access: "locked",
                why: "Each is what a customer was sent."
            },
            key: z.object({ customer_id: z.uuid(), invoice_id: z.uuid() }),
            path: ({ customer_id, invoice_id }) =>
                `${customer_id}/${invoice_id}.pdf`,
            content: bytes("application/pdf")
        })
    }

    get receipts() {
        return new Files(this.store, {
            folder: "receipts",
            shown: { name: "Receipts", about: "Each order's.", access: "open" },
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
            shown: { name: "Pages", about: "As HTML.", access: "open" },
            key: z.object({ slug: z.string().regex(/^[a-z0-9-]+$/) }),
            path: ({ slug }) => `${slug}.html`,
            content: text("text/html; charset=utf-8")
        })
    }

    get drafts() {
        return new Files(this.store, {
            folder: "drafts",
            shown: { name: "Drafts", about: "By name.", access: "open" },
            key: z.object({ name: z.string() }),
            path: ({ name }) => `${name}/draft.txt`,
            content: text("text/plain; charset=utf-8")
        })
    }

    override get kinds() {
        return [this.invoices, this.receipts, this.pages, this.drafts]
    }
}

function sample(options: { presigns?: boolean } = {}) {
    const memory = memoryStore(options)
    return { storage: new SampleStorage(memory.store), memory }
}

// Two of a customer's invoices, and one of another's
async function invoices(storage: SampleStorage) {
    const customer_id = randomUUID()
    const keys = [
        { customer_id, invoice_id: randomUUID() },
        { customer_id, invoice_id: randomUUID() },
        { customer_id: randomUUID(), invoice_id: randomUUID() }
    ]
    for (const key of keys) {
        await storage.invoices.put(key, new Uint8Array([1, 2, 3]))
    }
    return { customer_id, keys }
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

    it("says where each kind's folder is and how it shows", () => {
        const { storage } = sample()

        expect(storage.invoices.folder).toBe("invoices")
        expect(storage.invoices.shown).toEqual({
            name: "Invoices",
            about: "Each invoice sent, as the customer got it.",
            access: "locked",
            why: "Each is what a customer was sent."
        })
        expect(storage.kinds.map((kind) => kind.folder)).toEqual([
            "invoices",
            "receipts",
            "pages",
            "drafts"
        ])
    })

    it("describes a key's file without its bytes", async () => {
        const { storage } = sample()
        await storage.pages.put({ slug: "about" }, "<h1>About</h1>")

        expect(await storage.pages.head({ slug: "about" })).toEqual({
            size: 14,
            content_type: "text/html; charset=utf-8",
            modified: expect.any(Date)
        })
        expect(await storage.pages.head({ slug: "never-kept" })).toBeNull()
    })

    it("presigns a key's file, posted as its kind's content type unless it says", async () => {
        const { storage } = sample()
        const key = { customer_id: randomUUID(), invoice_id: randomUUID() }
        const path = storage.invoices.path(key)

        const link = await storage.invoices.presignGet(key, {
            seconds: 300,
            download: "Invoice.pdf"
        })
        const form = await storage.invoices.presignPost(key, {
            seconds: 600,
            max_bytes: 1000
        })
        const other = await storage.receipts.presignPost(
            { order_id: randomUUID() },
            { seconds: 600, max_bytes: 1000, content_type: "text/plain" }
        )

        expect(link).toEqual({
            ok: true,
            data: `https://bucket.test/${path}?expires=300&download=Invoice.pdf`
        })
        expect(form).toEqual({
            ok: true,
            data: {
                url: "https://bucket.test/",
                fields: {
                    key: path,
                    "Content-Type": "application/pdf",
                    expires: "600",
                    max_bytes: "1000"
                }
            }
        })
        expect(other.ok && other.data.fields["Content-Type"]).toBe("text/plain")
    })

    it("can't presign without a bucket, so its caller serves the file itself", async () => {
        const { storage } = sample({ presigns: false })

        expect(
            await storage.pages.presignGet({ slug: "about" }, { seconds: 60 })
        ).toEqual({ ok: false, error: "not-presignable" })
    })

    it("lists a kind's files, and the folders in it a page at a time", async () => {
        const { storage } = sample()
        const { customer_id, keys } = await invoices(storage)
        await storage.pages.put({ slug: "about" }, "<h1>About</h1>")

        const everything = await storage.invoices.list()
        const folders = await storage.invoices.list({ folders: true })
        const first = await storage.invoices.list({ folders: true, limit: 1 })
        const second = await storage.invoices.list({
            folders: true,
            limit: 1,
            cursor: first.cursor ?? undefined
        })
        const theirs = await storage.invoices.list({
            under: `invoices/${customer_id}/`
        })

        expect(everything.files.map((file) => file.key).sort()).toEqual(
            keys.map((key) => storage.invoices.path(key)).sort()
        )
        expect(everything.folders).toEqual([])
        expect(folders.files).toEqual([])
        expect(folders.folders).toHaveLength(2)
        expect(folders.folders).toContain(`invoices/${customer_id}/`)
        expect([...first.folders, ...second.folders]).toEqual(folders.folders)
        expect(second.cursor).toBeNull()
        expect(theirs.files.map((file) => file.key).sort()).toEqual(
            keys
                .slice(0, 2)
                .map((key) => storage.invoices.path(key))
                .sort()
        )
    })

    it("holds only the paths inside its own folder", () => {
        const { storage } = sample()

        expect(storage.invoices.holds("invoices/a/b.pdf")).toBe(true)
        expect(storage.invoices.holds("invoices/a/")).toBe(true)
        expect(storage.invoices.holds("invoices/")).toBe(false)
        expect(storage.invoices.holds("receipts/a.json")).toBe(false)
        expect(storage.invoices.holds("invoices/../receipts/a.json")).toBe(
            false
        )
        expect(storage.invoices.holds("invoices//a.pdf")).toBe(false)
        expect(() => storage.invoices.list({ under: "receipts/" })).toThrow(
            "receipts/ isn't one of invoices's"
        )
    })

    it("reads a file by the path a listing gave, without being able to change it", async () => {
        const { storage } = sample()
        const { keys } = await invoices(storage)
        const [listed] = (await storage.invoices.list()).files
        if (listed === undefined) {
            throw new Error("The invoices weren't listed")
        }

        const file = storage.invoices.at(listed.key)
        const opened = await file?.open({ start: 1 })

        expect(file?.path).toBe(listed.key)
        expect(Object.keys(file ?? {}).sort()).toEqual([
            "head",
            "open",
            "path",
            "presignGet"
        ])
        expect(await file?.head()).toEqual(expect.objectContaining({ size: 3 }))
        expect(
            opened?.ok &&
                new Uint8Array(
                    await new Response(opened.data.body).arrayBuffer()
                )
        ).toEqual(new Uint8Array([2, 3]))
        expect(await file?.presignGet({ seconds: 60 })).toEqual({
            ok: true,
            data: `https://bucket.test/${listed.key}?expires=60`
        })
        expect(storage.invoices.at("receipts/a.json")).toBeNull()
        expect(storage.invoices.at("invoices/a/")).toBeNull()
        expect(keys).toHaveLength(3)
    })
})
