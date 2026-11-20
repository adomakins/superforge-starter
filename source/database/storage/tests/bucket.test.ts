import { createHmac } from "node:crypto"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { ObjectStore } from ".."
import { attachment, bucketStore, signingKey } from "../bucket"

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

// AWS's own example credentials, from its Signature Version 4 docs
const EXAMPLE = {
    bucket: "examplebucket",
    endpoint: "https://s3.amazonaws.com",
    region: "us-east-1",
    access_key_id: "AKIAIOSFODNN7EXAMPLE",
    secret_access_key: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
}

// A bucket that answers each request with the next of `answers`, recording
// the requests
function answering(answers: Response[]) {
    const urls: string[] = []
    const storage = bucketStore(
        () => CONFIGURATION,
        async (request) => {
            urls.push(`${request.method} ${request.url}`)
            const answer = answers.shift()
            if (answer === undefined) {
                throw new Error("The test gave no answer for this request")
            } else {
                return answer
            }
        }
    )
    return { storage, urls }
}

describe("the Storage bucket's listings and links", () => {
    it("lists a folder with ListObjectsV2, reading its XML, and asks for the next page", async () => {
        const { storage, urls } = answering([
            new Response(
                `<?xml version="1.0" encoding="UTF-8"?>
<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><Name>storage-abc123</Name><Prefix>images/</Prefix><KeyCount>2</KeyCount><MaxKeys>2</MaxKeys><Delimiter>/</Delimiter><IsTruncated>true</IsTruncated><Contents><Key>images/fish &amp; chips.webp</Key><LastModified>2026-11-19T10:00:00.000Z</LastModified><ETag>&quot;abc&quot;</ETag><Size>1234</Size><StorageClass>STANDARD</StorageClass></Contents><CommonPrefixes><Prefix>images/front-door/</Prefix></CommonPrefixes><NextContinuationToken>token+1/2=</NextContinuationToken></ListBucketResult>`,
                { status: 200 }
            ),
            new Response(
                `<ListBucketResult><Prefix>images/</Prefix><IsTruncated>false</IsTruncated><Contents><Key>images/z.webp</Key><LastModified>2026-11-19T11:00:00.000Z</LastModified><Size>5</Size></Contents></ListBucketResult>`,
                { status: 200 }
            )
        ])

        const first = await storage.list("images/", { folders: true, limit: 2 })
        const second = await storage.list("images/", {
            folders: true,
            limit: 2,
            cursor: first.cursor ?? undefined
        })

        expect(first).toEqual({
            files: [
                {
                    key: "images/fish & chips.webp",
                    size: 1234,
                    modified: new Date("2026-11-19T10:00:00.000Z")
                }
            ],
            folders: ["images/front-door/"],
            cursor: "token+1/2="
        })
        expect(second).toEqual({
            files: [
                {
                    key: "images/z.webp",
                    size: 5,
                    modified: new Date("2026-11-19T11:00:00.000Z")
                }
            ],
            folders: [],
            cursor: null
        })
        expect(urls).toEqual([
            "GET https://storage-abc123.t3.storageapi.dev/?list-type=2&prefix=images%2F&max-keys=2&delimiter=%2F",
            "GET https://storage-abc123.t3.storageapi.dev/?list-type=2&prefix=images%2F&max-keys=2&delimiter=%2F&continuation-token=token%2B1%2F2%3D"
        ])
    })

    it("throws on a listing it can't read, rather than reading it as empty", async () => {
        vi.spyOn(console, "error").mockImplementation(() => {})
        const { storage } = answering([
            new Response(
                "<ListBucketResult><IsTruncated>false</IsTruncated><Contents><Key>a</Key></Contents></ListBucketResult>",
                { status: 200 }
            )
        ])

        await expect(storage.list("")).rejects.toThrow(
            "Storage listed  in a way it doesn't"
        )
    })

    it("describes a file from its headers, and one that isn't there as null", async () => {
        const { storage, urls } = answering([
            new Response(null, {
                status: 200,
                headers: {
                    "content-length": "1234",
                    "content-type": "application/pdf",
                    "last-modified": "Thu, 19 Nov 2026 10:00:00 GMT"
                }
            }),
            new Response(null, { status: 404 })
        ])

        expect(await storage.head("invoices/a b.pdf")).toEqual({
            size: 1234,
            content_type: "application/pdf",
            modified: new Date("2026-11-19T10:00:00.000Z")
        })
        expect(await storage.head("invoices/nothing.pdf")).toBeNull()
        expect(urls).toEqual([
            "HEAD https://storage-abc123.t3.storageapi.dev/invoices/a%20b.pdf",
            "HEAD https://storage-abc123.t3.storageapi.dev/invoices/nothing.pdf"
        ])
    })

    it("presigns a link as AWS's own example does", async () => {
        const storage = bucketStore(
            () => EXAMPLE,
            async () => new Response(null, { status: 500 }),
            () => new Date("2013-05-24T00:00:00Z")
        )

        const link = await storage.presignGet("test.txt", { seconds: 86400 })
        if (!link.ok) {
            throw new Error("The link wasn't presigned")
        }
        const url = new URL(link.data)

        expect(`${url.origin}${url.pathname}`).toBe(
            "https://examplebucket.s3.amazonaws.com/test.txt"
        )
        expect(Object.fromEntries(url.searchParams)).toEqual({
            "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
            "X-Amz-Credential":
                "AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request",
            "X-Amz-Date": "20130524T000000Z",
            "X-Amz-Expires": "86400",
            "X-Amz-SignedHeaders": "host",
            "X-Amz-Signature":
                "aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404"
        })
    })

    it("names a download in the link, with its spaces as %20", async () => {
        const { storage } = answering([])

        const link = await storage.presignGet("files/fi_1", {
            seconds: 300,
            download: "Truck lease – 2026.pdf"
        })
        if (!link.ok) {
            throw new Error("The link wasn't presigned")
        }

        expect(link.data).not.toContain("+")
        expect(
            new URL(link.data).searchParams.get("response-content-disposition")
        ).toBe(
            `attachment; filename="Truck lease _ 2026.pdf"; filename*=UTF-8''Truck%20lease%20%E2%80%93%202026.pdf`
        )
        expect(new URL(link.data).searchParams.get("X-Amz-Expires")).toBe("300")
    })

    it("refuses a link longer than Railway allows", async () => {
        const { storage } = answering([])

        await expect(
            storage.presignGet("a", { seconds: 91 * 24 * 60 * 60 })
        ).rejects.toThrow("A presigned link works 1 to 7776000 seconds")
    })

    it("derives the signing key as AWS's own example does", () => {
        expect(
            signingKey(
                "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY",
                "20120215",
                "us-east-1",
                "iam"
            ).toString("hex")
        ).toBe(
            "f4780e2d9f65fa895f9c67b32ce1baf0b0d8a43505a000a1a9e090d414db404d"
        )
    })

    it("presigns a form that holds the bucket to one key, one type and a size", async () => {
        const storage = bucketStore(
            () => CONFIGURATION,
            async () => new Response(null, { status: 500 }),
            () => new Date("2026-11-19T15:30:00Z")
        )

        const form = await storage.presignPost("files/fi_1", {
            seconds: 600,
            content_type: "application/pdf",
            max_bytes: 100_000_000
        })
        if (!form.ok) {
            throw new Error("The form wasn't presigned")
        }
        const {
            Policy,
            "X-Amz-Signature": signature,
            ...fields
        } = form.data.fields
        const policy = JSON.parse(
            Buffer.from(Policy ?? "", "base64").toString("utf8")
        )

        expect(form.data.url).toBe("https://storage-abc123.t3.storageapi.dev/")
        expect(fields).toEqual({
            "Content-Type": "application/pdf",
            bucket: "storage-abc123",
            "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
            "X-Amz-Credential": "key-id/20261119/auto/s3/aws4_request",
            "X-Amz-Date": "20261119T153000Z",
            key: "files/fi_1"
        })
        expect(policy).toEqual({
            expiration: "2026-11-19T15:40:00.000Z",
            conditions: [
                { "Content-Type": "application/pdf" },
                { bucket: "storage-abc123" },
                { "X-Amz-Algorithm": "AWS4-HMAC-SHA256" },
                { "X-Amz-Credential": "key-id/20261119/auto/s3/aws4_request" },
                { "X-Amz-Date": "20261119T153000Z" },
                { key: "files/fi_1" },
                ["content-length-range", 0, 100_000_000]
            ]
        })
        expect(signature).toBe(
            createHmac("sha256", signingKey("secret", "20261119", "auto", "s3"))
                .update(Policy ?? "")
                .digest("hex")
        )
    })

    it("names a file in plain ASCII for old browsers and in full for the rest", () => {
        expect(attachment('Quote "final".pdf')).toBe(
            `attachment; filename="Quote _final_.pdf"; filename*=UTF-8''Quote%20%22final%22.pdf`
        )
        expect(attachment("Ünit (1)*.csv")).toBe(
            `attachment; filename="_nit (1)*.csv"; filename*=UTF-8''%C3%9Cnit%20%281%29%2A.csv`
        )
    })
})
