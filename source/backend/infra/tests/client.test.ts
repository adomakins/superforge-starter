import { Hono } from "hono"
import { expect, test, vi } from "vitest"
import { infraClient } from "../client"
import type { FiledComment, QueryRequest, Visit } from "../index"

// The client against a fake of Infra's API, answering what Infra's README
// says each call answers, so no test reaches the real one

const KEY = "sf_test_0123456789abcdefghijklmnopqrstuv"
const ADDRESS = "https://infra.test/v1"

// Infra, answering `answer` to every call, and what each call sent it
function fakeInfra(answer: { status: number; body: unknown }) {
    const received: { path: string; key: string | null; body: unknown }[] = []
    const fake = new Hono().post("*", async (context) => {
        received.push({
            path: context.req.path,
            key: context.req.header("Authorization") ?? null,
            body: await context.req.json()
        })
        return new Response(JSON.stringify(answer.body), {
            status: answer.status,
            headers: { "Content-Type": "application/json" }
        })
    })
    const send: typeof fetch = async (input, init) =>
        fake.request(typeof input === "string" ? input : input.toString(), init)
    return { infra: infraClient({ key: KEY, url: ADDRESS, send }), received }
}

test("starting a sign-in sends the key, the visitor and the app's origin", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {})
    const { infra, received } = fakeInfra({
        status: 200,
        body: {
            email: "ada@example.com",
            with_link: true,
            expires_at: "2026-11-15T18:15:00.000Z",
            test: { code: "123456", link: "http://localhost:3000/sign-in#x" }
        }
    })
    const started = await infra.startSignIn({
        email: "ada@example.com",
        ip: "203.0.113.7",
        origin: "http://localhost:3000"
    })
    expect(started).toEqual({
        ok: true,
        data: {
            email: "ada@example.com",
            with_link: true,
            expires_at: new Date("2026-11-15T18:15:00.000Z"),
            test: { code: "123456", link: "http://localhost:3000/sign-in#x" }
        }
    })
    expect(received).toEqual([
        {
            path: "/v1/sign-in/start",
            key: `Bearer ${KEY}`,
            body: {
                email: "ada@example.com",
                ip: "203.0.113.7",
                origin: "http://localhost:3000"
            }
        }
    ])
})

test("with no origin, none is sent", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {})
    const { infra, received } = fakeInfra({
        status: 200,
        body: {
            email: "ada@example.com",
            with_link: false,
            expires_at: "2026-11-15T18:15:00.000Z",
            test: null
        }
    })
    await infra.startSignIn({
        email: "ada@example.com",
        ip: "::1",
        origin: null
    })
    expect(received[0]?.body).toEqual({ email: "ada@example.com", ip: "::1" })
})

test("Infra's limits come back as the app's refusals", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {})
    const cases = [
        {
            answer: {
                status: 429,
                body: { error: "too-soon", retry_after: 42 }
            },
            refused: { reason: "too-soon", retry_after: 42 }
        },
        {
            answer: {
                status: 429,
                body: { error: "too-many", limit: "ip", retry_after: 1800 }
            },
            refused: { reason: "too-many", limit: "ip", retry_after: 1800 }
        },
        {
            answer: { status: 502, body: { error: "not-sent" } },
            refused: { reason: "not-sent" }
        }
    ]
    for (const { answer, refused } of cases) {
        const { infra } = fakeInfra(answer)
        expect(
            await infra.startSignIn({
                email: "ada@example.com",
                ip: "::1",
                origin: null
            })
        ).toEqual({ ok: false, error: refused })
    }
})

test("verifying sends the code or the token, and answers the email", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {})
    const { infra, received } = fakeInfra({
        status: 200,
        body: { email: "ada@example.com" }
    })
    const token = "a".repeat(43)
    expect(
        await infra.verifySignIn({ email: "ada@example.com", code: "123456" })
    ).toEqual({ ok: true, data: { email: "ada@example.com" } })
    expect(await infra.verifySignIn({ token })).toEqual({
        ok: true,
        data: { email: "ada@example.com" }
    })
    expect(received.map((each) => each.body)).toEqual([
        { email: "ada@example.com", code: "123456" },
        { token }
    ])
})

test("a code Infra refuses says why", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {})
    const cases = [
        {
            body: { error: "wrong-code", attempts_left: 3 },
            refused: { reason: "wrong-code", attempts_left: 3 }
        },
        { body: { error: "no-code" }, refused: { reason: "no-code" } },
        { body: { error: "no-link" }, refused: { reason: "no-link" } }
    ]
    for (const { body, refused } of cases) {
        const { infra } = fakeInfra({ status: 400, body })
        expect(
            await infra.verifySignIn({
                email: "ada@example.com",
                code: "123456"
            })
        ).toEqual({ ok: false, error: refused })
    }
})

test("a key Infra refuses is unavailable, and logged for the owner", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {})
    const logged = vi.spyOn(console, "error").mockImplementation(() => {})
    const { infra } = fakeInfra({ status: 401, body: { error: "revoked-key" } })
    expect(
        await infra.startSignIn({
            email: "ada@example.com",
            ip: "::1",
            origin: null
        })
    ).toEqual({ ok: false, error: { reason: "unavailable" } })
    expect(logged).toHaveBeenCalledWith(
        "Infra refused the key: set a working one as INFRA_SECRET_KEY",
        expect.objectContaining({ answer: { error: "revoked-key" } })
    )
})

test("an answer that isn't Infra's shape is unavailable, and logged", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {})
    const logged = vi.spyOn(console, "error").mockImplementation(() => {})
    const { infra } = fakeInfra({ status: 200, body: { email: 42 } })
    expect(
        await infra.verifySignIn({ email: "ada@example.com", code: "123456" })
    ).toEqual({ ok: false, error: { reason: "unavailable" } })
    expect(logged).toHaveBeenCalledWith(
        "Infra answered what the app doesn't expect",
        expect.objectContaining({ status: 200 })
    )
})

test("an Infra that doesn't answer, or answers without JSON, is unavailable", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {})
    const down = infraClient({
        key: KEY,
        url: ADDRESS,
        send: async () => {
            throw new TypeError("fetch failed")
        }
    })
    expect(
        await down.startSignIn({
            email: "ada@example.com",
            ip: "::1",
            origin: null
        })
    ).toEqual({ ok: false, error: { reason: "unavailable" } })
    expect(logged).toHaveBeenCalledWith(
        "Infra didn't answer",
        expect.objectContaining({ call: "/sign-in/start" })
    )

    const proxy_page = infraClient({
        key: KEY,
        url: ADDRESS,
        send: async () =>
            new Response("<html>Bad gateway</html>", { status: 502 })
    })
    expect(await proxy_page.verifySignIn({ token: "a".repeat(43) })).toEqual({
        ok: false,
        error: { reason: "unavailable" }
    })
    expect(logged).toHaveBeenCalledWith(
        "Infra answered without JSON",
        expect.objectContaining({ status: 502 })
    )
})

test("events go with the key, each one's time as ISO 8601, and answer how many were kept", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {})
    const { infra, received } = fakeInfra({ status: 200, body: { kept: 2 } })
    const sent = await infra.sendEvents([
        { name: "signed-up", user: "user_42" },
        {
            name: "paid",
            at: new Date("2026-11-17T09:30:00.000Z"),
            user: "user_42",
            properties: { plan: "monthly" }
        }
    ])
    expect(sent).toEqual({ ok: true, data: { kept: 2 } })
    expect(received).toEqual([
        {
            path: "/v1/events",
            key: `Bearer ${KEY}`,
            body: {
                events: [
                    { name: "signed-up", user: "user_42" },
                    {
                        name: "paid",
                        at: "2026-11-17T09:30:00.000Z",
                        user: "user_42",
                        properties: { plan: "monthly" }
                    }
                ]
            }
        }
    ])
})

test("events Infra refuses say why, and are logged as the app's mistake", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {})
    const logged = vi.spyOn(console, "error").mockImplementation(() => {})
    const cases = [
        {
            answer: {
                status: 400,
                body: { error: "invalid", fields: ["events.0.name"] }
            },
            refused: { reason: "invalid", fields: ["events.0.name"] }
        },
        {
            answer: {
                status: 413,
                body: { error: "too-large", limit: 65536 }
            },
            refused: { reason: "too-large", limit: 65536 }
        }
    ]
    for (const { answer, refused } of cases) {
        const { infra } = fakeInfra(answer)
        expect(await infra.sendEvents([{ name: "signed-up" }])).toEqual({
            ok: false,
            error: refused
        })
    }
    expect(logged).toHaveBeenCalledWith(
        "Infra refused the app's events",
        expect.objectContaining({ status: 400 })
    )
})

test("events to an Infra that refuses the key, or doesn't answer, are unavailable", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {})
    vi.spyOn(console, "error").mockImplementation(() => {})
    const { infra } = fakeInfra({ status: 401, body: { error: "revoked-key" } })
    expect(await infra.sendEvents([{ name: "signed-up" }])).toEqual({
        ok: false,
        error: { reason: "unavailable" }
    })
    const down = infraClient({
        key: KEY,
        url: ADDRESS,
        send: async () => {
            throw new TypeError("fetch failed")
        }
    })
    expect(await down.sendEvents([{ name: "signed-up" }])).toEqual({
        ok: false,
        error: { reason: "unavailable" }
    })
})

// A batch of a page's events, as the app's /api/visits sends it
const VISIT: Visit = {
    mode: "ask-in-eu",
    visitor: {
        id: "2f1c8e64-7b5a-4f2e-9c3d-8a6b1e0f4d27",
        consent: "unasked",
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
            properties: { referrer: "google.com", utm_source: "google" }
        }
    ]
}

test("a page's events go to /v1/visits with the key, as the page sent them, and answer what Infra decided", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {})
    const { infra, received } = fakeInfra({
        status: 200,
        body: { kept: 1, remembered: false, ask: true }
    })
    expect(await infra.sendVisit(VISIT)).toEqual({
        ok: true,
        data: { kept: 1, remembered: false, ask: true }
    })
    expect(received).toEqual([
        { path: "/v1/visits", key: `Bearer ${KEY}`, body: VISIT }
    ])
})

test("a page's events Infra refuses say why, and are logged as the app's mistake", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {})
    const logged = vi.spyOn(console, "error").mockImplementation(() => {})
    const { infra } = fakeInfra({
        status: 400,
        body: { error: "invalid", fields: ["events.0.path"] }
    })
    expect(await infra.sendVisit(VISIT)).toEqual({
        ok: false,
        error: { reason: "invalid", fields: ["events.0.path"] }
    })
    expect(logged).toHaveBeenCalledWith(
        "Infra refused a page's events",
        expect.objectContaining({ status: 400 })
    )
})

test("a page's events to an Infra that's down, or answers what the app doesn't expect, are unavailable", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {})
    vi.spyOn(console, "error").mockImplementation(() => {})
    const cases = [
        { status: 503, body: { error: "unavailable" } },
        { status: 200, body: { kept: 1 } },
        { status: 401, body: { error: "unknown-key" } }
    ]
    for (const answer of cases) {
        const { infra } = fakeInfra(answer)
        expect(await infra.sendVisit(VISIT)).toEqual({
            ok: false,
            error: { reason: "unavailable" }
        })
    }
    const down = infraClient({
        key: KEY,
        url: ADDRESS,
        send: async () => {
            throw new TypeError("fetch failed")
        }
    })
    expect(await down.sendVisit(VISIT)).toEqual({
        ok: false,
        error: { reason: "unavailable" }
    })
})

// A comment as the app's server sends it, with who filed it
const COMMENT: FiledComment = {
    body: "This button sits too close to the edge on a phone",
    path: "/pricing",
    title: "Pricing",
    element: {
        selector: "body > div > main > a",
        tag: "a",
        text: "Book a call",
        classes: "inline-flex",
        box: { x: 120, y: 1640, width: 180, height: 44 }
    },
    viewport: { width: 1440, height: 900 },
    user: "5f0c1a2b-3d4e-4f60-8a9b-0c1d2e3f4a5b",
    user_agent: "Mozilla/5.0"
}

test("a comment goes to /v1/comments with the key, and answers its ID", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {})
    const { infra, received } = fakeInfra({
        status: 201,
        body: {
            comment: { id: "c-1", created_at: "2026-11-18T18:15:00.000Z" }
        }
    })
    expect(await infra.fileComment(COMMENT)).toEqual({
        ok: true,
        data: { id: "c-1", created_at: new Date("2026-11-18T18:15:00.000Z") }
    })
    expect(received).toEqual([
        { path: "/v1/comments", key: `Bearer ${KEY}`, body: COMMENT }
    ])
})

test("a comment Infra refuses says why, and is logged as the app's mistake", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {})
    const logged = vi.spyOn(console, "error").mockImplementation(() => {})
    const { infra } = fakeInfra({
        status: 400,
        body: { error: "invalid", fields: ["element.tag"] }
    })
    expect(await infra.fileComment(COMMENT)).toEqual({
        ok: false,
        error: { reason: "invalid", fields: ["element.tag"] }
    })
    expect(logged).toHaveBeenCalledWith(
        "Infra refused a comment",
        expect.objectContaining({ status: 400 })
    )
})

test("a comment to an Infra that's down, or answers 200, is unavailable", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {})
    vi.spyOn(console, "error").mockImplementation(() => {})
    for (const answer of [
        { status: 503, body: { error: "unavailable" } },
        { status: 200, body: { kept: 1 } },
        { status: 401, body: { error: "revoked-key" } }
    ]) {
        const { infra } = fakeInfra(answer)
        expect(await infra.fileComment(COMMENT)).toEqual({
            ok: false,
            error: { reason: "unavailable" }
        })
    }
})

// A call of two queries, one with parameters by position
const QUERIES: QueryRequest = {
    queries: {
        visits: { sql: "select count(*) as visits from visits" },
        pages: {
            sql: "select path, count(*) as views from events where name = 'view' group by path order by views desc limit $1",
            params: [10]
        }
    },
    days: 30,
    time_zone: "America/New_York"
}

test("queries go to /v1/query with the key, and answer each one's rows or why it has none", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {})
    const { infra, received } = fakeInfra({
        status: 200,
        body: {
            window: {
                since: "2026-10-20T04:00:00.000Z",
                days: 30,
                time_zone: "America/New_York",
                events: 1520
            },
            results: {
                visits: {
                    columns: [{ name: "visits", type: "BIGINT" }],
                    rows: [{ visits: 212 }],
                    truncated: false
                },
                pages: { error: "too-slow", seconds: 10 }
            }
        }
    })
    expect(await infra.query(QUERIES)).toEqual({
        ok: true,
        data: {
            window: {
                since: new Date("2026-10-20T04:00:00.000Z"),
                days: 30,
                time_zone: "America/New_York",
                events: 1520
            },
            results: {
                visits: {
                    ok: true,
                    data: {
                        columns: [{ name: "visits", type: "BIGINT" }],
                        rows: [{ visits: 212 }],
                        truncated: false
                    }
                },
                pages: {
                    ok: false,
                    error: {
                        reason: "too-slow",
                        message: "It ran past 10 seconds and was stopped"
                    }
                }
            }
        }
    })
    expect(received).toEqual([
        { path: "/v1/query", key: `Bearer ${KEY}`, body: QUERIES }
    ])
})

test("a query DuckDB couldn't run says why, in DuckDB's words", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {})
    const message = 'Binder Error: Referenced column "pathh" not found'
    const { infra } = fakeInfra({
        status: 200,
        body: {
            window: {
                since: "2026-10-20T04:00:00.000Z",
                days: 30,
                time_zone: "America/New_York",
                events: 1520
            },
            results: { pages: { error: "sql", message } }
        }
    })
    const asked = await infra.query(QUERIES)
    expect(asked.ok && asked.data.results.pages).toEqual({
        ok: false,
        error: { reason: "sql", message }
    })
})

test("queries Infra runs none of say why, and are logged", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {})
    const logged = vi.spyOn(console, "error").mockImplementation(() => {})
    const cases = [
        {
            answer: {
                status: 400,
                body: { error: "invalid", fields: ["time_zone"] }
            },
            refused: { reason: "invalid", fields: ["time_zone"] }
        },
        {
            answer: {
                status: 413,
                body: { error: "too-many-events", most: 200000 }
            },
            refused: { reason: "too-many-events", most: 200000 }
        }
    ]
    for (const { answer, refused } of cases) {
        const { infra } = fakeInfra(answer)
        expect(await infra.query(QUERIES)).toEqual({
            ok: false,
            error: refused
        })
    }
    expect(logged).toHaveBeenCalledWith(
        "Infra ran none of the app's queries",
        expect.objectContaining({ status: 413 })
    )
})

test("queries to an Infra that's down, or answers what the app doesn't expect, are unavailable", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {})
    vi.spyOn(console, "error").mockImplementation(() => {})
    for (const answer of [
        { status: 503, body: { error: "unavailable" } },
        { status: 200, body: { rows: [] } },
        { status: 401, body: { error: "unknown-key" } }
    ]) {
        const { infra } = fakeInfra(answer)
        expect(await infra.query(QUERIES)).toEqual({
            ok: false,
            error: { reason: "unavailable" }
        })
    }
    const down = infraClient({
        key: KEY,
        url: ADDRESS,
        send: async () => {
            throw new TypeError("fetch failed")
        }
    })
    expect(await down.query(QUERIES)).toEqual({
        ok: false,
        error: { reason: "unavailable" }
    })
})
