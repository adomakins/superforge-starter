import { afterEach, describe, expect, it, vi } from "vitest"
import type { ObjectStore } from ".."
import { bucketStore } from "../bucket"

// What's kept under `key`, as text
async function read(storage: ObjectStore, key: string) {
    const kept = await storage.get(key)
    if (kept === null) {
        return null
    } else {
        return new TextDecoder().decode(kept)
    }
}

afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
})

const CONFIGURATION = {
    bucket: "storage-abc123",
    endpoint: "https://t3.storageapi.dev",
    region: "auto",
    access_key_id: "key-id",
    secret_access_key: "secret"
}

/**
 * A bucket in front of a fake S3, which keeps each object and answers with
 * whatever `answers` holds first, recording every request it gets.
 */
function bucket(answers: (Response | Error)[] = []) {
    const objects = new Map<string, string>()
    const requests: {
        method: string
        url: string
        authorization: string | null
        content_type: string | null
    }[] = []
    const storage = bucketStore(
        () => CONFIGURATION,
        async (request) => {
            requests.push({
                method: request.method,
                url: request.url,
                authorization: request.headers.get("authorization"),
                content_type: request.headers.get("content-type")
            })
            const answer = answers.shift()
            if (answer instanceof Error) {
                throw answer
            } else if (answer !== undefined) {
                return answer
            } else if (request.method === "PUT") {
                objects.set(request.url, await request.text())
                return new Response(null, { status: 200 })
            } else if (request.method === "DELETE") {
                objects.delete(request.url)
                return new Response(null, { status: 204 })
            } else {
                const object = objects.get(request.url)
                return object === undefined
                    ? new Response("NoSuchKey", { status: 404 })
                    : new Response(object, { status: 200 })
            }
        }
    )
    return { storage, requests }
}

describe("the Storage bucket", () => {
    it("puts and gets each key at a virtual-hosted URL, signed with its keys", async () => {
        const { storage, requests } = bucket()

        await storage.put(
            "invoices/customer-1/invoice 1",
            "<p>Hi</p>",
            "text/html; charset=utf-8"
        )

        expect(await read(storage, "invoices/customer-1/invoice 1")).toBe(
            "<p>Hi</p>"
        )
        expect(requests).toEqual([
            {
                method: "PUT",
                url: "https://storage-abc123.t3.storageapi.dev/invoices/customer-1/invoice%201",
                authorization: expect.stringMatching(
                    /^AWS4-HMAC-SHA256 Credential=key-id\/\d{8}\/auto\/s3\/aws4_request, /
                ),
                content_type: "text/html; charset=utf-8"
            },
            expect.objectContaining({ method: "GET" })
        ])
    })

    it("sends a file's bytes as they came", async () => {
        const bytes = new Uint8Array([0, 255, 137, 80])
        const sent: Uint8Array[] = []
        const storage = bucketStore(
            () => CONFIGURATION,
            async (request) => {
                sent.push(new Uint8Array(await request.arrayBuffer()))
                return new Response(null, { status: 200 })
            }
        )

        await storage.put("uploads/one/1.png", bytes, "image/png")

        expect(sent).toEqual([bytes])
    })

    it("deletes a key's file, and a key that holds nothing too", async () => {
        const { storage, requests } = bucket()
        await storage.put("invoices/a", "<p>A</p>", "text/html")

        await storage.delete("invoices/a")
        await storage.delete("invoices/a")

        expect(requests.map((request) => request.method)).toEqual([
            "PUT",
            "DELETE",
            "DELETE"
        ])
    })

    it("reads a key that holds nothing as null", async () => {
        const { storage } = bucket()

        expect(await read(storage, "invoices/nothing")).toBeNull()
    })

    it("makes a request again when the bucket fails for a reason that may pass", async () => {
        vi.spyOn(console, "warn").mockImplementation(() => {})
        const { storage, requests } = bucket([
            new Response("SlowDown", { status: 503 }),
            new TypeError("fetch failed")
        ])

        await storage.put("invoices/a", "<p>A</p>", "text/html")

        expect(requests).toHaveLength(3)
        expect(await read(storage, "invoices/a")).toBe("<p>A</p>")
    })

    it("takes an answer for one when the server has swapped the global Response", async () => {
        const warned = vi.spyOn(console, "warn").mockImplementation(() => {})
        // Answers as `fetch` makes them, before the swap
        const { storage, requests } = bucket([
            new Response(null, { status: 200 }),
            new Response("<p>A</p>", { status: 200 }),
            new Response("SlowDown", { status: 503 }),
            new Response(null, { status: 200 })
        ])
        // As `serve()` from @hono/node-server does in production
        // (source/node.ts), which nothing `fetch` answers is an instance of
        vi.stubGlobal("Response", class Response {})

        await storage.put("invoices/a", "<p>A</p>", "text/html")
        expect(await read(storage, "invoices/a")).toBe("<p>A</p>")
        expect(requests).toHaveLength(2)
        expect(warned).not.toHaveBeenCalled()

        // A failure that may pass is still made again
        await storage.put("invoices/b", "<p>B</p>", "text/html")
        expect(requests).toHaveLength(4)
        expect(warned).toHaveBeenCalledOnce()
    })

    it("throws when the bucket refuses a put", async () => {
        vi.spyOn(console, "error").mockImplementation(() => {})
        const { storage, requests } = bucket([
            new Response("AccessDenied", { status: 403 })
        ])

        await expect(
            storage.put("invoices/a", "<p>A</p>", "text/html")
        ).rejects.toThrow("Storage refused invoices/a with 403")
        // A refusal isn't one that passes, so it's made once
        expect(requests).toHaveLength(1)
    })
})
