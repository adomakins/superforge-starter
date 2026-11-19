import { afterEach, expect, test, vi } from "vitest"
import { MINUTE } from "@/utilities/primitives/durations"
import type { Visit } from "../index"
import { standInInfra } from "../stand-in"

// The stand-in treats a code and a link, and a page's events, as Infra's
// test mode does, so what the tests and a dev server without a test key
// see is what a test key gets from the real one

const EMAIL = "ada@example.com"
const ORIGIN = "http://localhost:3000"

afterEach(() => {
    vi.useRealTimers()
})

// A sign-in started on a new stand-in: its code, and its link's token
async function started(origin: string | null = ORIGIN) {
    const infra = standInInfra()
    const sent = await infra.startSignIn({ email: EMAIL, ip: "::1", origin })
    if (!sent.ok || sent.data.test === null) {
        throw new Error("The stand-in didn't start a sign-in")
    }
    const { code, link } = sent.data.test
    return { infra, sent: sent.data, code, token: link?.split("#")[1] }
}

test("starting answers the code, and a link to the app's /sign-in", async () => {
    const { sent, code } = await started()
    expect(sent.email).toBe(EMAIL)
    expect(sent.with_link).toBe(true)
    expect(code).toMatch(/^\d{6}$/)
    expect(sent.test?.link).toMatch(
        /^http:\/\/localhost:3000\/sign-in#[\w-]{43}$/
    )
})

test("with no origin, there's a code but no link", async () => {
    const { sent } = await started(null)
    expect(sent.with_link).toBe(false)
    expect(sent.test?.link).toBeNull()
})

test("the code signs in once", async () => {
    const { infra, code } = await started()
    expect(await infra.verifySignIn({ email: EMAIL, code })).toEqual({
        ok: true,
        data: { email: EMAIL }
    })
    expect(await infra.verifySignIn({ email: EMAIL, code })).toEqual({
        ok: false,
        error: { reason: "no-code" }
    })
})

test("the link signs in once, and spends the code with it", async () => {
    const { infra, code, token = "" } = await started()
    expect(await infra.verifySignIn({ token })).toEqual({
        ok: true,
        data: { email: EMAIL }
    })
    expect(await infra.verifySignIn({ token })).toEqual({
        ok: false,
        error: { reason: "no-link" }
    })
    expect((await infra.verifySignIn({ email: EMAIL, code })).ok).toBe(false)
})

test("five wrong guesses stop the code, the right one after them too", async () => {
    const { infra, code } = await started()
    const wrong = code === "000000" ? "111111" : "000000"
    for (const attempts_left of [4, 3, 2, 1]) {
        expect(await infra.verifySignIn({ email: EMAIL, code: wrong })).toEqual(
            { ok: false, error: { reason: "wrong-code", attempts_left } }
        )
    }
    expect(await infra.verifySignIn({ email: EMAIL, code: wrong })).toEqual({
        ok: false,
        error: { reason: "no-code" }
    })
    expect(await infra.verifySignIn({ email: EMAIL, code })).toEqual({
        ok: false,
        error: { reason: "no-code" }
    })
})

test("a new email replaces the last, whose code and link stop working", async () => {
    const { infra, code, token = "" } = await started()
    const again = await infra.startSignIn({
        email: EMAIL,
        ip: "::1",
        origin: ORIGIN
    })
    expect(again.ok).toBe(true)
    expect(await infra.verifySignIn({ token })).toEqual({
        ok: false,
        error: { reason: "no-link" }
    })
    const old = await infra.verifySignIn({ email: EMAIL, code })
    // The old code is wrong for the new one, unless they happen to match
    if (again.ok && again.data.test?.code !== code) {
        expect(old).toEqual({
            ok: false,
            error: { reason: "wrong-code", attempts_left: 4 }
        })
    }
})

test("the code and the link stop after 15 minutes", async () => {
    vi.useFakeTimers()
    const { infra, code, token = "" } = await started()
    vi.advanceTimersByTime(15 * MINUTE)
    expect(await infra.verifySignIn({ email: EMAIL, code })).toEqual({
        ok: false,
        error: { reason: "no-code" }
    })
    expect(await infra.verifySignIn({ token })).toEqual({
        ok: false,
        error: { reason: "no-link" }
    })
})

test("events are checked as Infra checks them, and none is kept", async () => {
    const infra = standInInfra()
    expect(
        await infra.sendEvents([
            { name: "signed-up", user: "user_42" },
            { name: "paid", at: new Date(), properties: { plan: "monthly" } }
        ])
    ).toEqual({ ok: true, data: { kept: 0 } })
    expect(
        await infra.sendEvents([
            { name: "signed-up" },
            { name: "Signed Up", user: "ada@example.com" }
        ])
    ).toEqual({
        ok: false,
        error: { reason: "invalid", fields: ["events.1.name", "events.1.user"] }
    })
    expect(await infra.sendEvents([])).toEqual({
        ok: false,
        error: { reason: "invalid", fields: ["events"] }
    })
})

test("a call's events over 64 KB are too large", async () => {
    const infra = standInInfra()
    const big = { note: "x".repeat(1000) }
    const events = Array.from({ length: 80 }, () => ({
        name: "noted",
        properties: big
    }))
    expect(await infra.sendEvents(events)).toEqual({
        ok: false,
        error: { reason: "too-large", limit: 65536 }
    })
})

// A batch of one page event from a visitor, as the app's /api/visits sends
// it, in `mode`, from a visitor who answered `consent`
function visit(
    mode: Visit["mode"],
    consent: Visit["visitor"]["consent"] = "unasked"
): Visit {
    return {
        mode,
        visitor: {
            id:
                mode === "never"
                    ? null
                    : "2f1c8e64-7b5a-4f2e-9c3d-8a6b1e0f4d27",
            consent,
            user: null,
            ip: "203.0.113.9",
            user_agent: "Mozilla/5.0"
        },
        sent_at: 1_763_445_600_000,
        events: [
            {
                name: "view",
                at: 1_763_445_598_000,
                path: "/pricing",
                properties: {}
            }
        ]
    }
}

test("a page's events are answered by the mode, as Infra answers a visitor it can't place, and none is kept", async () => {
    const infra = standInInfra()
    const cases: [
        Visit["mode"],
        Visit["visitor"]["consent"],
        boolean,
        boolean
    ][] = [
        // Mode, what they answered, remembered, asked
        ["remember", "unasked", true, false],
        ["remember", "given", true, false],
        ["remember", "declined", false, false],
        ["ask", "unasked", false, true],
        ["ask", "given", true, false],
        ["ask", "declined", false, false],
        // Where a visitor is can't be known here, so as `ask`
        ["ask-in-eu", "unasked", false, true],
        ["ask-in-eu", "given", true, false],
        ["ask-in-eu", "declined", false, false],
        ["never", "unasked", false, false],
        ["never", "given", false, false],
        ["never", "declined", false, false]
    ]
    for (const [mode, consent, remembered, ask] of cases) {
        expect(await infra.sendVisit(visit(mode, consent))).toEqual({
            ok: true,
            data: { kept: 0, remembered, ask }
        })
    }
})

test("a page's events are checked as Infra checks them", async () => {
    const infra = standInInfra()
    const wrong = visit("remember")
    expect(
        await infra.sendVisit({
            ...wrong,
            visitor: { ...wrong.visitor, ip: "not an address", user: "a@b.co" },
            events: [
                { name: "Viewed!", at: 1, path: "pricing", properties: {} }
            ]
        })
    ).toEqual({
        ok: false,
        error: {
            reason: "invalid",
            fields: [
                "events.0.name",
                "events.0.path",
                "visitor.user",
                "visitor.ip"
            ]
        }
    })
    expect(await infra.sendVisit({ ...wrong, events: [] })).toEqual({
        ok: false,
        error: { reason: "invalid", fields: ["events"] }
    })
    const big = { note: "x".repeat(1000) }
    expect(
        await infra.sendVisit({
            ...wrong,
            events: Array.from({ length: 80 }, (_, index) => ({
                name: "noted",
                at: index,
                path: "/",
                properties: big
            }))
        })
    ).toEqual({ ok: false, error: { reason: "too-large", limit: 65536 } })
})

test("a dev server's stand-in logs each batch, since nothing keeps it", async () => {
    const logged = vi.spyOn(console, "info").mockImplementation(() => {})
    await standInInfra().sendVisit(visit("ask"))
    expect(logged).not.toHaveBeenCalled()
    await standInInfra({ logs: true }).sendVisit(visit("ask"))
    expect(logged).toHaveBeenCalledWith(
        expect.stringContaining("a page's events"),
        expect.objectContaining({ mode: "ask", remembered: false, ask: true }),
        visit("ask").events
    )
})

test("every query answers no rows, and a dev server's stand-in says a test key reads the events", async () => {
    const logged = vi.spyOn(console, "info").mockImplementation(() => {})
    const request = {
        queries: {
            visits: { sql: "select count(*) as visits from visits" },
            pages: { sql: "select path from events" }
        },
        days: 7,
        time_zone: "America/New_York"
    }
    const asked = await standInInfra().query(request)
    expect(asked).toEqual({
        ok: true,
        data: {
            window: {
                since: expect.any(Date),
                days: 7,
                time_zone: "America/New_York",
                events: 0
            },
            results: {
                visits: {
                    ok: true,
                    data: { columns: [], rows: [], truncated: false }
                },
                pages: {
                    ok: true,
                    data: { columns: [], rows: [], truncated: false }
                }
            }
        }
    })
    expect(logged).not.toHaveBeenCalled()
    await standInInfra({ logs: true }).query(request)
    expect(logged).toHaveBeenCalledWith(
        expect.stringContaining("INFRA_TEST_KEY"),
        { queries: ["visits", "pages"] }
    )
})
