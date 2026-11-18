import { INFRA_URL } from "@/utilities/infra"
import { SECOND } from "@/utilities/primitives/durations"
import {
    events_refused,
    sent_events,
    start_refused,
    started_sign_in,
    verified_sign_in,
    verify_refused
} from "./answers"
import { eventsBody } from "./events"
import type { Infra, InfraUnavailable } from "./index"

// How long a call waits for Infra's answer. Starting a sign-in waits on
// Infra sending the email, which takes a second or two.
const TIMEOUT = 15 * SECOND

const UNAVAILABLE: InfraUnavailable = { reason: "unavailable" }

/**
 * Infra, called over HTTP with a project's key: a secret key in a build, a
 * test key in a dev server. No call is retried, since none is safe to send
 * twice (a second start sends a second email, a second verify finds the
 * code spent, and events sent again are kept twice); the visitor asks
 * again instead, and an event that didn't go is lost. `send` is `fetch`,
 * or a test's own.
 */
export function infraClient({
    key,
    url = INFRA_URL,
    send = fetch
}: {
    key: string
    url?: string
    send?: typeof fetch
}): Infra {
    // One call: its status and its JSON, or null when it never answered or
    // answered something that isn't JSON, which is logged
    async function post(call: string, body: unknown) {
        const response = await send(`${url}${call}`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${key}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(TIMEOUT)
        }).catch((error: unknown) => {
            console.error("Infra didn't answer", { call, error })
            return null
        })
        if (response === null) {
            return null
        }
        const json: unknown = await response.json().catch((error: unknown) => {
            console.error("Infra answered without JSON", {
                call,
                status: response.status,
                error
            })
            return undefined
        })
        if (json === undefined) {
            return null
        } else {
            console.info("Infra answered", { call, status: response.status })
            return { status: response.status, json }
        }
    }

    return {
        async startSignIn({ email, ip, origin }) {
            const call = "/sign-in/start"
            const answer = await post(
                call,
                origin === null ? { email, ip } : { email, ip, origin }
            )
            if (answer === null) {
                return { ok: false, error: UNAVAILABLE }
            } else if (answer.status === 200) {
                const parsed = started_sign_in.safeParse(answer.json)
                if (parsed.success) {
                    return { ok: true, data: parsed.data }
                } else {
                    return unexpected(call, answer)
                }
            } else {
                const parsed = start_refused.safeParse(answer.json)
                if (parsed.success) {
                    return { ok: false, error: parsed.data }
                } else {
                    return unexpected(call, answer)
                }
            }
        },

        async verifySignIn(proof) {
            const call = "/sign-in/verify"
            const answer = await post(call, proof)
            if (answer === null) {
                return { ok: false, error: UNAVAILABLE }
            } else if (answer.status === 200) {
                const parsed = verified_sign_in.safeParse(answer.json)
                if (parsed.success) {
                    return { ok: true, data: parsed.data }
                } else {
                    return unexpected(call, answer)
                }
            } else {
                const parsed = verify_refused.safeParse(answer.json)
                if (parsed.success) {
                    return { ok: false, error: parsed.data }
                } else {
                    return unexpected(call, answer)
                }
            }
        },

        async sendEvents(events) {
            const call = "/events"
            const answer = await post(call, eventsBody(events))
            if (answer === null) {
                return { ok: false, error: UNAVAILABLE }
            } else if (answer.status === 200) {
                const parsed = sent_events.safeParse(answer.json)
                if (parsed.success) {
                    return { ok: true, data: parsed.data }
                } else {
                    return unexpected(call, answer)
                }
            } else {
                const parsed = events_refused.safeParse(answer.json)
                if (parsed.success) {
                    // What the app sent is wrong, which only a change here
                    // fixes
                    console.error("Infra refused the app's events", {
                        call,
                        status: answer.status,
                        refused: parsed.data
                    })
                    return { ok: false, error: parsed.data }
                } else {
                    return unexpected(call, answer)
                }
            }
        }
    }
}

// An answer the app doesn't expect: a key Infra refused (401, which an
// owner fixes in Railway), a body this app sent wrong (400 `invalid`, a
// bug here), or something Infra has never answered. Logged with what it
// said, and unavailable to the visitor.
function unexpected(call: string, answer: { status: number; json: unknown }) {
    if (answer.status === 401) {
        console.error(
            "Infra refused the key: set a working one as INFRA_SECRET_KEY",
            { call, answer: answer.json }
        )
    } else {
        console.error("Infra answered what the app doesn't expect", {
            call,
            status: answer.status,
            answer: answer.json
        })
    }
    return { ok: false as const, error: UNAVAILABLE }
}
