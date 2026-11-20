import { createHmac } from "node:crypto"
import { setTimeout as sleep } from "node:timers/promises"
import { AwsClient } from "aws4fetch"
import { z } from "zod"
import { type Listing, LONGEST_PRESIGN_SECONDS, type ObjectStore } from "."
import { pageLimit } from "./listing"

// Railway's bucket, through its S3 API: each request signed with the
// bucket's keys (AWS's Signature Version 4, by aws4fetch, which only signs,
// so the request goes out on `fetch`). Railway's buckets take
// virtual-hosted URLs, with the bucket's name in front of the endpoint's
// host (docs.railway.com/storage-buckets, "URL style"), and the region
// Railway gives them, `auto`.

/** A bucket's S3 credentials, as Railway names them. */
export type BucketConfiguration = {
    bucket: string
    endpoint: string
    region: string
    access_key_id: string
    secret_access_key: string
}

// How long one request may take, and how many times one that failed for a
// reason that may pass (a 5xx, a 429, no answer) is made in all
const TIMEOUT_MILLISECONDS = 30 * 1000
const ATTEMPTS = 3

/**
 * The bucket, with its credentials read the first time it's used, so a
 * server missing them only fails what keeps a file. `fetch`, and `now`,
 * which presigned links are signed at, are the tests' to replace.
 */
export function bucketStore(
    configuration: () => BucketConfiguration,
    fetch: (request: Request) => Promise<Response> = globalThis.fetch,
    now: () => Date = () => new Date()
): ObjectStore {
    let connected:
        | { client: AwsClient; base: URL; settings: BucketConfiguration }
        | undefined
    function connection() {
        if (connected === undefined) {
            const settings = configuration()
            const base = new URL(settings.endpoint)
            base.hostname = `${settings.bucket}.${base.hostname}`
            connected = {
                client: new AwsClient({
                    accessKeyId: settings.access_key_id,
                    secretAccessKey: settings.secret_access_key,
                    service: "s3",
                    region: settings.region
                }),
                base,
                settings
            }
        }
        return connected
    }

    // One request, signed afresh for each attempt, since a signature
    // carries its time. The timeout covers the whole exchange, or, for a
    // file streamed on as it arrives (`open`), only the wait for its headers,
    // so a slow reader on the other end doesn't cut it off part way.
    async function send(
        key: string,
        init: RequestInit,
        timeout: "whole" | "headers" = "whole",
        query: Record<string, string> = {}
    ): Promise<Response> {
        const { client, base } = connection()
        const url = objectUrl(base, key, query)
        for (let attempt = 1; ; attempt += 1) {
            const abort = new AbortController()
            const timer = setTimeout(
                () => abort.abort(new Error("Storage took too long to answer")),
                TIMEOUT_MILLISECONDS
            )
            const request = await client.sign(url, {
                ...init,
                signal: abort.signal
            })
            // What came back, or what `fetch` threw, told apart by which it
            // did rather than by class: the Node server swaps the global
            // `Response` for its own (`serve()` in source/node.ts, from
            // `@hono/node-server`), and what `fetch` answers isn't one of
            // those
            const sent: { response: Response } | { error: unknown } =
                await (async () => {
                    try {
                        return { response: await fetch(request) }
                    } catch (error) {
                        return { error }
                    }
                })()
            if (timeout === "headers" || !("response" in sent)) {
                clearTimeout(timer)
            } else {
                // Until the body has been read, which the caller does
                timer.unref()
            }
            const passing =
                !("response" in sent) ||
                sent.response.status === 429 ||
                sent.response.status >= 500
            if (passing && attempt < ATTEMPTS) {
                console.warn("A Storage request failed, so it's made again", {
                    method: init.method,
                    key,
                    attempt,
                    status: "response" in sent ? sent.response.status : null,
                    error: "response" in sent ? null : sent.error
                })
                await sleep(200 * 4 ** (attempt - 1))
            } else if ("response" in sent) {
                return sent.response
            } else {
                throw sent.error
            }
        }
    }

    return {
        async put(key, body, content_type) {
            const response = await send(key, {
                method: "PUT",
                body,
                headers: { "content-type": content_type }
            })
            if (!response.ok) {
                const answer = await response.text()
                console.error("Storage refused a file", {
                    key,
                    status: response.status,
                    answer
                })
                throw new Error(
                    `Storage refused ${key} with ${response.status}: ${answer}`
                )
            }
        },

        async get(key) {
            const response = await send(key, { method: "GET" })
            if (response.status === 404) {
                return null
            } else if (response.ok) {
                return new Uint8Array(await response.arrayBuffer())
            } else {
                const answer = await response.text()
                console.error("Storage wouldn't hand over a file", {
                    key,
                    status: response.status,
                    answer
                })
                throw new Error(
                    `Storage refused to read ${key} with ${response.status}: ${answer}`
                )
            }
        },

        async open(key, range) {
            const headers: Record<string, string> = {}
            if (range !== undefined) {
                headers.range = `bytes=${range.start}-${range.end ?? ""}`
            }
            const response = await send(
                key,
                { method: "GET", headers },
                "headers"
            )
            if (response.status === 404) {
                await response.body?.cancel()
                return { ok: false, error: "not-found" }
            } else if (response.status === 416) {
                await response.body?.cancel()
                return { ok: false, error: "unsatisfiable" }
            } else if (!response.ok || response.body === null) {
                const answer = await response.text()
                console.error("Storage wouldn't stream a file", {
                    key,
                    status: response.status,
                    answer
                })
                throw new Error(
                    `Storage refused to stream ${key} with ${response.status}: ${answer}`
                )
            } else if (response.status === 206) {
                const span = contentRange(response.headers.get("content-range"))
                if (span === null) {
                    await response.body.cancel()
                    throw new Error(
                        `Storage answered ${key}'s range without saying which`
                    )
                } else {
                    return {
                        ok: true,
                        data: { body: response.body, ...span, partial: true }
                    }
                }
            } else {
                const size = Number(response.headers.get("content-length"))
                return {
                    ok: true,
                    data: {
                        body: response.body,
                        size,
                        start: 0,
                        end: size - 1,
                        partial: false
                    }
                }
            }
        },

        async delete(key) {
            // S3 answers 204 whether or not there was a file
            const response = await send(key, { method: "DELETE" })
            if (!response.ok && response.status !== 404) {
                const answer = await response.text()
                console.error("Storage wouldn't delete a file", {
                    key,
                    status: response.status,
                    answer
                })
                throw new Error(
                    `Storage refused to delete ${key} with ${response.status}: ${answer}`
                )
            }
        },

        async list(prefix, options = {}) {
            // ListObjectsV2, on the bucket itself rather than a key
            const query: Record<string, string> = {
                "list-type": "2",
                prefix,
                "max-keys": String(pageLimit(options))
            }
            if (options.folders === true) {
                query.delimiter = "/"
            }
            if (options.cursor !== undefined) {
                query["continuation-token"] = options.cursor
            }
            const response = await send("", { method: "GET" }, "whole", query)
            const answer = await response.text()
            if (!response.ok) {
                console.error("Storage wouldn't list a folder", {
                    prefix,
                    status: response.status,
                    answer
                })
                throw new Error(
                    `Storage refused to list ${prefix} with ${response.status}: ${answer}`
                )
            } else {
                return listingOf(answer, prefix)
            }
        },

        async head(key) {
            const response = await send(key, { method: "HEAD" })
            if (response.status === 404) {
                return null
            } else if (!response.ok) {
                console.error("Storage wouldn't describe a file", {
                    key,
                    status: response.status
                })
                throw new Error(
                    `Storage refused to describe ${key} with ${response.status}`
                )
            } else {
                const read = file_details.safeParse({
                    size: response.headers.get("content-length"),
                    content_type:
                        response.headers.get("content-type") ??
                        "application/octet-stream",
                    modified: response.headers.get("last-modified")
                })
                if (read.success) {
                    return read.data
                } else {
                    throw new Error(
                        `Storage described ${key} in a way it doesn't: ${z.prettifyError(read.error)}`
                    )
                }
            }
        },

        async presignGet(key, options) {
            const { client, base } = connection()
            const query: Record<string, string> = {
                "X-Amz-Expires": String(presignSeconds(options.seconds))
            }
            if (options.download !== undefined) {
                query["response-content-disposition"] = attachment(
                    options.download
                )
            }
            const signed = await client.sign(objectUrl(base, key, query), {
                method: "GET",
                aws: { signQuery: true, datetime: amazonDate(now()) }
            })
            // aws4fetch writes the query back with a space as `+`, which S3
            // may read as a plus, so as `%20`: a real `+` is already `%2B`
            const url = new URL(signed.url)
            url.search = url.search.replaceAll("+", "%20")
            return { ok: true, data: url.href }
        },

        async presignPost(key, options) {
            const { settings, base } = connection()
            const seconds = presignSeconds(options.seconds)
            if (!Number.isInteger(options.max_bytes) || options.max_bytes < 1) {
                throw new Error(
                    `A presigned form takes a whole number of bytes, not ${options.max_bytes}`
                )
            }

            // The fields the browser sends, as AWS's own SDK makes them
            // (createPresignedPost, which Railway's guide uses), and the
            // policy that holds the bucket to them, signed with a key made
            // from the secret, the day and the region
            const signed_at = now()
            const date = amazonDate(signed_at)
            const scope = `${date.slice(0, 8)}/${settings.region}/s3/aws4_request`
            const fields: Record<string, string> = {
                "Content-Type": options.content_type,
                bucket: settings.bucket,
                "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
                "X-Amz-Credential": `${settings.access_key_id}/${scope}`,
                "X-Amz-Date": date
            }
            const policy = Buffer.from(
                JSON.stringify({
                    expiration: new Date(
                        signed_at.getTime() + seconds * 1000
                    ).toISOString(),
                    conditions: [
                        ...Object.entries(fields).map(([name, value]) => ({
                            [name]: value
                        })),
                        { key },
                        ["content-length-range", 0, options.max_bytes]
                    ]
                })
            ).toString("base64")
            const signature = createHmac(
                "sha256",
                signingKey(
                    settings.secret_access_key,
                    date.slice(0, 8),
                    settings.region,
                    "s3"
                )
            )
                .update(policy)
                .digest("hex")
            return {
                ok: true,
                data: {
                    url: base.href,
                    fields: {
                        ...fields,
                        key,
                        Policy: policy,
                        "X-Amz-Signature": signature
                    }
                }
            }
        }
    }
}

// Where a key's object is: each part of it encoded on its own, so the
// slashes between the folders stay slashes. The query's spaces are `%20`,
// which S3 reads as spaces, where a `+` it may read as a plus.
function objectUrl(base: URL, key: string, query: Record<string, string> = {}) {
    const url = new URL(base)
    url.pathname = `/${key.split("/").map(encodeURIComponent).join("/")}`
    url.search = Object.entries(query)
        .map(
            ([name, value]) =>
                `${encodeURIComponent(name)}=${encodeURIComponent(value)}`
        )
        .join("&")
    return url.href
}

// What ListObjectsV2 answers, read out of its XML: each file's key, size
// and when it was kept, each folder's prefix, and the token for the next
// page while there's one. Its elements are flat and few, so they're found
// by name rather than with an XML parser, and checked with zod.
function listingOf(xml: string, prefix: string): Listing {
    const read = z
        .object({
            files: z.array(listed_file),
            folders: z.array(z.string().min(1)),
            truncated: z.enum(["true", "false"]),
            token: z.string().min(1).nullable()
        })
        .safeParse({
            files: elements(xml, "Contents").map((contents) => ({
                key: element(contents, "Key"),
                size: element(contents, "Size"),
                modified: element(contents, "LastModified")
            })),
            folders: elements(xml, "CommonPrefixes").map((common) =>
                element(common, "Prefix")
            ),
            truncated: element(xml, "IsTruncated"),
            token: element(xml, "NextContinuationToken")
        })
    if (!read.success) {
        console.error("Storage listed a folder in a way it doesn't", {
            prefix,
            xml
        })
        throw new Error(
            `Storage listed ${prefix} in a way it doesn't: ${z.prettifyError(read.error)}`
        )
    } else {
        const { files, folders, truncated, token } = read.data
        return {
            files,
            folders,
            cursor: truncated === "true" ? token : null
        }
    }
}

// A size and a time as S3 writes them, as text: a missing one fails rather
// than reading as 0 or 1970, as a bare coercion would
const byte_count = z.string().regex(/^\d+$/).transform(Number)
const time = z.string().min(1).pipe(z.coerce.date())

const listed_file = z.object({
    key: z.string().min(1),
    size: byte_count,
    modified: time
})

const file_details = z.object({
    size: byte_count,
    content_type: z.string().min(1),
    modified: time
})

// What's inside each <name>…</name> in `xml`
function elements(xml: string, name: string) {
    return [
        ...xml.matchAll(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`, "g"))
    ].map((found) => found[1] ?? "")
}

// The text of the first <name>…</name> in `xml`, its entities read, or null
// when there's none
function element(xml: string, name: string) {
    const [inside] = elements(xml, name)
    if (inside === undefined) {
        return null
    } else {
        return inside.replace(
            /&(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);/g,
            (_, entity: string) => {
                if (entity.startsWith("#x")) {
                    return String.fromCodePoint(
                        Number.parseInt(entity.slice(2), 16)
                    )
                } else if (entity.startsWith("#")) {
                    return String.fromCodePoint(Number(entity.slice(1)))
                } else {
                    return ENTITIES[entity] ?? ""
                }
            }
        )
    }
}

const ENTITIES: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'"
}

// How long a presigned link or form works, checked: a whole number of
// seconds, up to the longest Railway allows
function presignSeconds(seconds: number) {
    if (
        !Number.isInteger(seconds) ||
        seconds < 1 ||
        seconds > LONGEST_PRESIGN_SECONDS
    ) {
        throw new Error(
            `A presigned link works 1 to ${LONGEST_PRESIGN_SECONDS} seconds, not ${seconds}`
        )
    } else {
        return seconds
    }
}

// A time as Signature Version 4 writes it: 20261119T153000Z
function amazonDate(time: Date) {
    return time.toISOString().replace(/[-:]|\.\d{3}/g, "")
}

/**
 * The key Signature Version 4 signs with: the secret, narrowed to one day,
 * one region and one service, each in turn.
 */
export function signingKey(
    secret: string,
    day: string,
    region: string,
    service: string
) {
    const keyed = (key: string | Buffer, data: string) =>
        createHmac("sha256", key).update(data).digest()
    return keyed(
        keyed(keyed(keyed(`AWS4${secret}`, day), region), service),
        "aws4_request"
    )
}

/**
 * A Content-Disposition that saves a file as `name`: the name in plain
 * ASCII for old browsers, with what isn't swapped for `_`, and in full as
 * UTF-8 (RFC 6266) for the rest.
 */
export function attachment(name: string) {
    const plain = name.replace(/[^\x20-\x7e]|["\\]/g, "_")
    const encoded = encodeURIComponent(name).replace(
        /['()*]/g,
        (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`
    )
    return `attachment; filename="${plain}"; filename*=UTF-8''${encoded}`
}

// Which bytes a 206 holds, of how many: `bytes 0-1023/146515`
function contentRange(header: string | null) {
    const found = header?.match(/^bytes (\d+)-(\d+)\/(\d+)$/)
    if (found === undefined || found === null) {
        return null
    } else {
        return {
            start: Number(found[1]),
            end: Number(found[2]),
            size: Number(found[3])
        }
    }
}
