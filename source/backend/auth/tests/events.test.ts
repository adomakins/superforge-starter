import { expect, test, vi } from "vitest"
import { testApi } from "@/backend/tests/support/api"
import { analytics_events, users } from "@/database/schema"

// What signing in records: a `signed-up` event when a sign-in makes someone
// new, with their user's ID, and their browser's when the site remembers
// it, and nothing else. An event that can't be recorded never holds
// signing in up.

const EMAIL = "ada@example.com"

const VISITOR = "2f1c8e64-7b5a-4f2e-9c3d-8a6b1e0f4d27"

// Signs EMAIL in by its code, from a browser with `cookie`, and answers
// the verify's response
async function signIn(api: Awaited<ReturnType<typeof testApi>>, cookie = "") {
    const started = await api.client.api.auth.start.$post({
        json: { email: EMAIL }
    })
    if (started.status !== 200) {
        throw new Error("The sign-in didn't start")
    }
    const { development } = await started.json()
    if (development === null) {
        throw new Error("The stand-in answers the code")
    }
    return await api.client.api.auth.verify.$post(
        { json: { email: EMAIL, code: development.code } },
        { headers: { cookie } }
    )
}

test("a first sign-in records that someone signed up, by their ID and their browser's, once", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {})
    const api = await testApi()
    await signIn(api, `visitor=${VISITOR}`)
    await signIn(api, `visitor=${VISITOR}`)

    const [user] = await api.database.select().from(users)
    const events = await api.database.select().from(analytics_events)
    expect(events).toEqual([
        expect.objectContaining({
            source: "server",
            name: "signed-up",
            user_id: user?.id,
            visitor_id: VISITOR,
            visit_id: null,
            properties: {}
        })
    ])
    expect(JSON.stringify(events)).not.toContain(EMAIL)
})

test("a sign-up from a browser the site doesn't remember is recorded without one", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {})
    const api = await testApi()
    await signIn(api)
    await signIn(api, "visitor=not%20an%20id")

    const events = await api.database.select().from(analytics_events)
    expect(events.map((event) => event.visitor_id)).toEqual([null])
})

test("a sign-up whose event can't be recorded still signs them in, and says so in the logs", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {})
    const logged = vi.spyOn(console, "error").mockImplementation(() => {})
    const api = await testApi()
    // The table gone, as a database that can't take the row
    await api.database.execute("drop table analytics_events")

    const verified = await signIn(api)
    expect(verified.status).toBe(200)
    expect(logged).toHaveBeenCalledWith(
        "The sign-up's event wasn't recorded",
        expect.objectContaining({ user_id: expect.any(String) })
    )
})
