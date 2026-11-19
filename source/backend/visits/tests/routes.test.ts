import { expect, test, vi } from "vitest"
import type { Infra, Visit } from "@/backend/infra"
import { standInInfra } from "@/backend/infra/stand-in"
import { testApi } from "@/backend/tests/support/api"
import { signInAs } from "@/backend/tests/support/sign-in"
import { api_failure } from "@/utilities/schemas/failures"
import type { VisitorMode } from "@/utilities/visitors"

// The pages' events through the whole API, to Infra's stand-in, in each of
// the app's modes: what the server sends Infra of the visitor, and the
// cookies it sets, renews and clears by Infra's answer

const BATCH = {
    sent_at: 1_763_445_600_000,
    events: [
        {
            name: "view",
            at: 1_763_445_598_000,
            path: "/pricing",
            properties: { title: "Pricing" }
        }
    ]
}

const KEPT_ID = "2f1c8e64-7b5a-4f2e-9c3d-8a6b1e0f4d27"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

// 400 days, in seconds: the longest Chrome keeps a cookie
const LIFETIME = 34_560_000

// The stand-in, with every page's batch sent through it, or `sendVisit` in
// place of its own
function recordingInfra(sendVisit?: Infra["sendVisit"]) {
    const sent: Visit[] = []
    const stand_in = standInInfra()
    const infra: Infra = {
        startSignIn: (request) => stand_in.startSignIn(request),
        verifySignIn: (proof) => stand_in.verifySignIn(proof),
        sendEvents: (events) => stand_in.sendEvents(events),
        sendVisit: async (visit) => {
            sent.push(visit)
            return await (sendVisit ?? stand_in.sendVisit)(visit)
        },
        fileComment: (comment) => stand_in.fileComment(comment)
    }
    return { infra, sent }
}

// The API in `mode`, and what it sent Infra
async function setup(visitor_mode: VisitorMode = "remember") {
    const { infra, sent } = recordingInfra()
    const api = await testApi({ infra, visitor_mode })
    return { api, sent }
}

// Posts BATCH as a page does, with `cookie` and any other `headers`
async function post(
    api: Awaited<ReturnType<typeof testApi>>,
    cookie = "",
    headers: Record<string, string> = {}
) {
    return await api.client.api.visits.$post(
        { json: BATCH },
        { headers: { cookie, ...headers } }
    )
}

// Each cookie a response set, by its name: the whole Set-Cookie line
function cookiesSet(response: Response) {
    return new Map(
        response.headers
            .getSetCookie()
            .map((line) => [line.slice(0, line.indexOf("=")), line])
    )
}

// The value a Set-Cookie line sets
function cookieValue(line: string | undefined) {
    return /^[^=]+=([^;]*)/.exec(line ?? "")?.[1]
}

test("in remember mode, a new visitor is remembered: a new ID, in a lasting cookie no script reads", async () => {
    const { api, sent } = await setup("remember")
    const response = await post(api, "", {
        "User-Agent": "Mozilla/5.0 (iPhone)",
        "X-Real-IP": "203.0.113.9"
    })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ask: false })

    expect(sent).toEqual([
        {
            mode: "remember",
            visitor: {
                id: expect.stringMatching(UUID),
                consent: "unasked",
                user: null,
                ip: "203.0.113.9",
                user_agent: "Mozilla/5.0 (iPhone)"
            },
            ...BATCH
        }
    ])
    const visitor = cookiesSet(response).get("visitor")
    expect(cookieValue(visitor)).toBe(sent[0]?.visitor.id)
    expect(visitor).toMatch(/; Max-Age=34560000/)
    expect(visitor).toMatch(/; Path=\//)
    expect(visitor).toMatch(/; HttpOnly/)
    expect(visitor).toMatch(/; SameSite=Lax/)
    // Plain http on this computer, where a browser won't keep a Secure one
    expect(visitor).not.toMatch(/Secure/)
    expect(cookiesSet(response).has("visitor_consent")).toBe(false)
})

test("a remembered visitor keeps their ID, renewed for another 400 days with each batch", async () => {
    const { api, sent } = await setup("remember")
    const response = await post(api, `visitor=${KEPT_ID}`)
    expect(sent[0]?.visitor.id).toBe(KEPT_ID)
    const visitor = cookiesSet(response).get("visitor")
    expect(cookieValue(visitor)).toBe(KEPT_ID)
    expect(visitor).toMatch(new RegExp(`Max-Age=${LIFETIME}`))
})

test("a visitor's cookie that isn't an ID is replaced with a new one", async () => {
    const { api, sent } = await setup("remember")
    const response = await post(api, "visitor=not%20an%20id")
    expect(sent[0]?.visitor.id).toMatch(UUID)
    expect(cookieValue(cookiesSet(response).get("visitor"))).toBe(
        sent[0]?.visitor.id
    )
})

test("in remember mode, a visitor who once declined isn't remembered, and their ID is cleared", async () => {
    const { api, sent } = await setup("remember")
    const response = await post(
        api,
        `visitor=${KEPT_ID}; visitor_consent=declined`
    )
    expect(await response.json()).toEqual({ ask: false })
    expect(sent[0]?.visitor.consent).toBe("declined")
    const visitor = cookiesSet(response).get("visitor")
    expect(cookieValue(visitor)).toBe("")
    expect(visitor).toMatch(/Max-Age=0/)
})

test("in ask mode, a visitor who hasn't answered is asked, and nothing is set", async () => {
    const { api, sent } = await setup("ask")
    const response = await post(api)
    expect(await response.json()).toEqual({ ask: true })
    expect(sent[0]?.mode).toBe("ask")
    expect(sent[0]?.visitor.consent).toBe("unasked")
    expect(response.headers.getSetCookie()).toEqual([])
})

test("in ask mode, an ID kept before the visitor was asked is cleared until they accept", async () => {
    const { api } = await setup("ask")
    const response = await post(api, `visitor=${KEPT_ID}`)
    expect(await response.json()).toEqual({ ask: true })
    expect(cookieValue(cookiesSet(response).get("visitor"))).toBe("")
})

test("in ask mode, a visitor who accepted is remembered and not asked", async () => {
    const { api, sent } = await setup("ask")
    const response = await post(api, "visitor_consent=given")
    expect(await response.json()).toEqual({ ask: false })
    expect(sent[0]?.visitor.consent).toBe("given")
    expect(cookieValue(cookiesSet(response).get("visitor"))).toMatch(UUID)
})

test("in ask-in-eu mode, a visitor Infra can't place is asked, as everyone on this computer is", async () => {
    const { api, sent } = await setup("ask-in-eu")
    const response = await post(api, `visitor=${KEPT_ID}`)
    expect(await response.json()).toEqual({ ask: true })
    expect(sent[0]?.mode).toBe("ask-in-eu")
    expect(cookieValue(cookiesSet(response).get("visitor"))).toBe("")

    const accepted = await post(api, "visitor_consent=given")
    expect(await accepted.json()).toEqual({ ask: false })
    expect(cookieValue(cookiesSet(accepted).get("visitor"))).toMatch(UUID)
})

test("in never mode, no ID goes to Infra, no one is asked, and an old ID is cleared", async () => {
    const { api, sent } = await setup("never")
    const fresh = await post(api, "visitor_consent=given")
    expect(await fresh.json()).toEqual({ ask: false })
    expect(fresh.headers.getSetCookie()).toEqual([])

    const before = await post(api, `visitor=${KEPT_ID}`)
    expect(await before.json()).toEqual({ ask: false })
    expect(cookieValue(cookiesSet(before).get("visitor"))).toBe("")
    expect(sent.map((visit) => visit.visitor.id)).toEqual([null, null])
})

test("the signed-in person's user ID goes with their events, never their email", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {})
    const { api, sent } = await setup("remember")
    const ada = await signInAs(api, "ada@example.com")
    await post(api, ada.cookie)
    await post(api)
    expect(sent.map((visit) => visit.visitor.user)).toEqual([ada.id, null])
    expect(JSON.stringify(sent)).not.toContain("ada@example.com")
})

test("over https, the cookies are Secure", async () => {
    const { api } = await setup("remember")
    const response = await api.api.request(
        "https://shop.example.com/api/visits",
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(BATCH)
        }
    )
    expect(cookiesSet(response).get("visitor")).toMatch(/; Secure/)
    const answered = await api.api.request(
        "https://shop.example.com/api/visits/consent",
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ consent: "given" })
        }
    )
    expect(cookiesSet(answered).get("visitor_consent")).toMatch(/; Secure/)
})

test("when Infra is down, the page isn't asked, the batch is lost and logged, and no cookie changes", async () => {
    const warned = vi.spyOn(console, "warn").mockImplementation(() => {})
    const { infra, sent } = recordingInfra(async () => ({
        ok: false,
        error: { reason: "unavailable" }
    }))
    const api = await testApi({ infra, visitor_mode: "remember" })
    const response = await post(
        api,
        `visitor=${KEPT_ID}; visitor_consent=declined`
    )
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ask: false })
    expect(sent).toHaveLength(1)
    expect(response.headers.getSetCookie()).toEqual([])
    expect(warned).toHaveBeenCalledWith(
        "A page's events didn't reach Infra, and are lost",
        { reason: "unavailable", events: 1 }
    )
})

test("a batch that isn't one is refused, and one over 64 KB", async () => {
    const { api, sent } = await setup("remember")
    const wrong = await api.client.api.visits.$post({
        json: { sent_at: BATCH.sent_at, events: [] }
    })
    expect(wrong.status).toBe(400)
    expect(api_failure.parse(await wrong.json()).error.reason).toBe("invalid")

    const big = await api.api.request("/api/visits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...BATCH, padding: "x".repeat(65 * 1024) })
    })
    expect(big.status).toBe(413)
    expect(api_failure.parse(await big.json()).error.reason).toBe("too-large")
    expect(sent).toEqual([])
})

test("accepting keeps the answer in a lasting cookie no script reads, and leaves the ID", async () => {
    const { api } = await setup("ask")
    const response = await api.client.api.visits.consent.$post(
        { json: { consent: "given" } },
        { headers: { cookie: `visitor=${KEPT_ID}` } }
    )
    expect(response.status).toBe(204)
    const consent = cookiesSet(response).get("visitor_consent")
    expect(cookieValue(consent)).toBe("given")
    expect(consent).toMatch(/; Max-Age=34560000/)
    expect(consent).toMatch(/; Path=\//)
    expect(consent).toMatch(/; HttpOnly/)
    expect(consent).toMatch(/; SameSite=Lax/)
    expect(cookiesSet(response).has("visitor")).toBe(false)
})

test("declining keeps the answer and clears the ID at once", async () => {
    const { api } = await setup("remember")
    const response = await api.client.api.visits.consent.$post(
        { json: { consent: "declined" } },
        { headers: { cookie: `visitor=${KEPT_ID}` } }
    )
    expect(response.status).toBe(204)
    expect(cookieValue(cookiesSet(response).get("visitor_consent"))).toBe(
        "declined"
    )
    const visitor = cookiesSet(response).get("visitor")
    expect(cookieValue(visitor)).toBe("")
    expect(visitor).toMatch(/Max-Age=0/)
})

test("an answer that isn't one is refused", async () => {
    const { api } = await setup("ask")
    const response = await api.api.request("/api/visits/consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consent: "maybe" })
    })
    expect(response.status).toBe(400)
    expect(response.headers.getSetCookie()).toEqual([])
})

test("in ask mode, a visitor is asked, accepts, and is remembered from the next batch", async () => {
    const { api } = await setup("ask")
    const asked = await post(api)
    expect(await asked.json()).toEqual({ ask: true })

    const accepted = await api.client.api.visits.consent.$post({
        json: { consent: "given" }
    })
    const consent = `visitor_consent=${cookieValue(cookiesSet(accepted).get("visitor_consent"))}`

    const next = await post(api, consent)
    expect(await next.json()).toEqual({ ask: false })
    const id = cookieValue(cookiesSet(next).get("visitor"))
    expect(id).toMatch(UUID)

    const after = await post(api, `${consent}; visitor=${id}`)
    expect(cookieValue(cookiesSet(after).get("visitor"))).toBe(id)
})
