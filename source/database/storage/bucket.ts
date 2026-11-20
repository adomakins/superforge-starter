import { setTimeout as sleep } from "node:timers/promises"
import { AwsClient } from "aws4fetch"
import type { ObjectStore } from "."

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
 * server missing them only fails what keeps a file. `fetch` is the tests'
 * to replace.
 */
export function bucketStore(
    configuration: () => BucketConfiguration,
    fetch: (request: Request) => Promise<Response> = globalThis.fetch
): ObjectStore {
    let connected: { client: AwsClient; base: URL } | undefined
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
                base
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
        timeout: "whole" | "headers" = "whole"
    ): Promise<Response> {
        const { client, base } = connection()
        const url = objectUrl(base, key)
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
        }
    }
}

// Where a key's object is: each part of it encoded on its own, so the
// slashes between the folders stay slashes
function objectUrl(base: URL, key: string) {
    const url = new URL(base)
    url.pathname = `/${key.split("/").map(encodeURIComponent).join("/")}`
    return url.href
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
