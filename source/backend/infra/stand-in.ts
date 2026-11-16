import { randomToken } from "@/backend/auth/tokens"
import { MINUTE } from "@/utilities/primitives/durations"
import type { Infra } from "./index"

// How Infra treats a code: it works for 15 minutes and five tries, and a
// new one for the same address replaces it, link and all
const LIFETIME = 15 * MINUTE
const ATTEMPTS = 5

/** A sign-in the stand-in sent, waiting to be verified. */
export type WaitingSignIn = {
    email: string
    code: string
    token: string
    attempts: number
    expires_at: number
}

/**
 * Infra's test mode, in memory: what a test key gets from the real one,
 * with no key and no network. Starting a sign-in sends nothing and answers
 * the code and the link, and verifying checks them as Infra does: each
 * works once, for 15 minutes, and a code for five tries. No limits apply,
 * as none do to a test key. The tests always use it, so they never reach
 * Infra, and so does a dev server with no test key (choose.ts). A build
 * never does: anyone could sign in as anyone, since the page shows the
 * code.
 *
 * `waiting` is where it keeps what it sent, by address: its own, or one
 * that outlives a dev server's reloads.
 */
export function standInInfra(
    waiting: Map<string, WaitingSignIn> = new Map()
): Infra {
    return {
        async startSignIn({ email, origin }) {
            const sent: WaitingSignIn = {
                email,
                code: randomCode(),
                token: randomToken(),
                attempts: 0,
                expires_at: Date.now() + LIFETIME
            }
            waiting.set(email, sent)
            return {
                ok: true,
                data: {
                    email,
                    with_link: origin !== null,
                    expires_at: new Date(sent.expires_at),
                    test: {
                        code: sent.code,
                        link:
                            origin === null
                                ? null
                                : `${origin}/sign-in#${sent.token}`
                    }
                }
            }
        },

        async verifySignIn(proof) {
            if ("token" in proof) {
                const sent = [...waiting.values()].find(
                    (each) => each.token === proof.token
                )
                if (sent === undefined || sent.expires_at <= Date.now()) {
                    return { ok: false, error: { reason: "no-link" } }
                } else {
                    waiting.delete(sent.email)
                    return { ok: true, data: { email: sent.email } }
                }
            }

            const sent = waiting.get(proof.email)
            if (
                sent === undefined ||
                sent.expires_at <= Date.now() ||
                sent.attempts >= ATTEMPTS
            ) {
                return { ok: false, error: { reason: "no-code" } }
            }
            // Each guess counts, the right one too, as Infra counts them
            sent.attempts += 1
            if (sent.code === proof.code) {
                waiting.delete(sent.email)
                return { ok: true, data: { email: sent.email } }
            } else if (sent.attempts < ATTEMPTS) {
                return {
                    ok: false,
                    error: {
                        reason: "wrong-code",
                        attempts_left: ATTEMPTS - sent.attempts
                    }
                }
            } else {
                return { ok: false, error: { reason: "no-code" } }
            }
        }
    }
}

/**
 * Six random digits. A draw past the last whole million is drawn again, so
 * the modulo doesn't make low codes likelier.
 */
function randomCode() {
    for (;;) {
        // One number, which a one-number array always holds
        const [draw = 0] = crypto.getRandomValues(new Uint32Array(1))
        if (draw < 4_294_000_000) {
            return String(draw % 1_000_000).padStart(6, "0")
        }
    }
}
