import {
    createLocalJWKSet,
    exportJWK,
    generateKeyPair,
    type JWTVerifyGetKey,
    SignJWT
} from "jose"
import { randomToken } from "@/backend/auth/tokens"
import { DAY, MINUTE } from "@/utilities/primitives/durations"
import type { AgentScope } from "@/utilities/schemas/agents"
import { COMMENT_BODY_LIMIT } from "@/utilities/schemas/comments"
import { EVENTS_BODY_LIMIT } from "@/utilities/schemas/events"
import type { VisitorMode } from "@/utilities/visitors"
import { checkToken } from "./agents"
import { filed_comment } from "./comments"
import { eventsBody, server_events } from "./events"
import type { Infra } from "./index"
import { type VisitConsent, visit } from "./visits"

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
 * as none do to a test key. Events are checked as Infra checks them, and
 * none is kept; a page's are answered by the app's mode as Infra answers
 * them for a visitor it can't place (`treatment`). A comment is checked
 * too, and answered an ID, though nothing keeps it, where Infra keeps a
 * test key's. Every query answers no rows, since there are no events to
 * read, where a test key reads the project's real ones. The tests always
 * use it, so they never reach Infra, and so does a dev server with no test
 * key (choose.ts). A build never does: anyone could sign in as anyone,
 * since the page shows the code.
 *
 * `waiting` is where it keeps what it sent, by address: its own, or one
 * that outlives a dev server's reloads. With `logs`, as a dev server has
 * it, each batch of a page's events is logged, and each comment, since
 * nothing keeps them, and each call of queries, which need a test key.
 */
export function standInInfra({
    waiting = new Map(),
    logs = false
}: {
    waiting?: Map<string, WaitingSignIn>
    logs?: boolean
} = {}): Infra {
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
        },

        async sendEvents(events) {
            const body = JSON.stringify(eventsBody(events))
            if (new TextEncoder().encode(body).byteLength > EVENTS_BODY_LIMIT) {
                return {
                    ok: false,
                    error: { reason: "too-large", limit: EVENTS_BODY_LIMIT }
                }
            }
            const checked = server_events.safeParse(events)
            if (checked.success) {
                return { ok: true, data: { kept: 0 } }
            } else {
                // The fields that failed, as Infra names them
                const fields = checked.error.issues.map((issue) =>
                    ["events", ...issue.path].join(".")
                )
                return { ok: false, error: { reason: "invalid", fields } }
            }
        },

        async sendVisit(sent) {
            const body = JSON.stringify(sent)
            if (new TextEncoder().encode(body).byteLength > EVENTS_BODY_LIMIT) {
                return {
                    ok: false,
                    error: { reason: "too-large", limit: EVENTS_BODY_LIMIT }
                }
            }
            const checked = visit.safeParse(sent)
            if (!checked.success) {
                // The fields that failed, as Infra names them
                const fields = checked.error.issues.map((issue) =>
                    issue.path.join(".")
                )
                return { ok: false, error: { reason: "invalid", fields } }
            }
            const { mode, visitor, events } = checked.data
            const { remembered, ask } = treatment(mode, visitor.consent)
            if (logs) {
                // The events on their own, so a terminal shows each one's
                // properties rather than [Object]
                console.info(
                    "Infra's stand-in: a page's events, which Infra would keep, and which nothing keeps here",
                    {
                        mode,
                        consent: visitor.consent,
                        user: visitor.user,
                        remembered,
                        ask
                    },
                    events
                )
            }
            return { ok: true, data: { kept: 0, remembered, ask } }
        },

        async fileComment(comment) {
            const body = JSON.stringify(comment)
            if (
                new TextEncoder().encode(body).byteLength > COMMENT_BODY_LIMIT
            ) {
                return {
                    ok: false,
                    error: { reason: "too-large", limit: COMMENT_BODY_LIMIT }
                }
            }
            const checked = filed_comment.safeParse(comment)
            if (!checked.success) {
                // The fields that failed, as Infra names them
                const fields = checked.error.issues.map((issue) =>
                    issue.path.join(".")
                )
                return { ok: false, error: { reason: "invalid", fields } }
            }
            if (logs) {
                console.info(
                    "Infra's stand-in: a comment, which Infra would keep, and which nothing keeps here",
                    checked.data
                )
            }
            return {
                ok: true,
                data: { id: crypto.randomUUID(), created_at: new Date() }
            }
        },

        // The stand-in keeps no events and runs no SQL, so every query
        // answers no rows: a dev server shows the project's real ones with
        // a test key (choose.ts)
        async query({ queries, days, time_zone }) {
            if (logs) {
                console.info(
                    "Infra's stand-in runs no SQL, so every query answers no rows. Set INFRA_TEST_KEY to read the project's events.",
                    { queries: Object.keys(queries) }
                )
            }
            return {
                ok: true,
                data: {
                    window: {
                        since: new Date(Date.now() - days * DAY),
                        days,
                        time_zone,
                        events: 0
                    },
                    results: Object.fromEntries(
                        Object.keys(queries).map((name) => [
                            name,
                            {
                                ok: true as const,
                                data: {
                                    columns: [],
                                    rows: [],
                                    truncated: false
                                }
                            }
                        ])
                    )
                }
            }
        },

        // Claude's sign-in needs Infra: the stand-in signs nobody in, and
        // only checks the tokens a test mints with `standInAgentToken`
        async passOAuth() {
            if (logs) {
                console.info(
                    "Infra's stand-in can't sign Claude in. Set INFRA_TEST_KEY to connect Claude to a dev server."
                )
            }
            return Response.json(
                {
                    error: "temporarily_unavailable",
                    error_description:
                        "This dev server has no Infra test key, so Claude can't sign in to it"
                },
                { status: 503, headers: { "Cache-Control": "no-store" } }
            )
        },
        async agentRequest() {
            return { ok: false, error: { error: "not-found" } }
        },
        async allowAgent() {
            return { ok: false, error: { error: "not-found" } }
        },
        async denyAgent() {
            return { ok: false, error: { error: "not-found" } }
        },
        async agentConnections() {
            return { ok: true, data: [] }
        },
        async endAgentConnection() {
            return { ok: false, error: { error: "not-found" } }
        },
        async endAgentConnections() {
            return { ok: true, data: 0 }
        },
        async checkAgentToken(token, origin) {
            const { public_keys } = await standInKeys()
            return await checkToken(public_keys, token, {
                origin,
                project: STAND_IN_PROJECT,
                mode: "test"
            })
        }
    }
}

// The project the stand-in's tokens are for
const STAND_IN_PROJECT = "sf_project_stand_in"

let keys: Promise<{ signing: CryptoKey; public_keys: JWTVerifyGetKey }>

// A key pair of the stand-in's own, made the first time it's needed
function standInKeys() {
    keys ??= generateKeyPair("ES256").then(async (pair) => ({
        signing: pair.privateKey,
        public_keys: createLocalJWKSet({
            keys: [{ ...(await exportJWK(pair.publicKey)), kid: "stand-in" }]
        })
    }))
    return keys
}

/**
 * A token as Infra signs one, for a test to call the API as Claude does:
 * acting as `email`, with `scopes`, for the app at `origin` (the tests'
 * own is `http://localhost`), which the stand-in's `checkAgentToken` takes
 */
export async function standInAgentToken({
    email,
    scopes = ["read", "act"],
    origin = "http://localhost",
    expires_in = "10m"
}: {
    email: string
    scopes?: AgentScope[]
    origin?: string
    expires_in?: string
}) {
    const { signing } = await standInKeys()
    return await new SignJWT({
        scope: scopes.join(" "),
        project: STAND_IN_PROJECT,
        mode: "test",
        connection: crypto.randomUUID()
    })
        .setProtectedHeader({ alg: "ES256", kid: "stand-in", typ: "at+jwt" })
        .setIssuer(origin)
        .setAudience(`${origin}/mcp`)
        .setSubject(email)
        .setIssuedAt()
        .setExpirationTime(expires_in)
        .sign(signing)
}

/**
 * Whether Infra remembers a visitor, and whether their page asks them, by
 * the app's mode and what they answered, as README.md's table has it, for a
 * visitor whose country is unknown, as every one's is here: so
 * `ask-in-eu` treats them as `ask` does.
 */
function treatment(mode: VisitorMode, consent: VisitConsent) {
    if (mode === "remember") {
        return { remembered: consent !== "declined", ask: false }
    } else if (mode === "ask" || mode === "ask-in-eu") {
        return { remembered: consent === "given", ask: consent === "unasked" }
    } else {
        // `never`
        return { remembered: false, ask: false }
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
