import { setTimeout as sleep } from "node:timers/promises"
import { AwsClient } from "aws4fetch"
import type { Storage } from "."

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
export function bucketStorage(
    configuration: () => BucketConfiguration,
    fetch: (request: Request) => Promise<Response> = globalThis.fetch
): Storage {
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
    // carries its time
    async function send(key: string, init: RequestInit): Promise<Response> {
        const { client, base } = connection()
        const url = objectUrl(base, key)
        for (let attempt = 1; ; attempt += 1) {
            const request = await client.sign(url, {
                ...init,
                signal: AbortSignal.timeout(TIMEOUT_MILLISECONDS)
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
                return response.text()
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
