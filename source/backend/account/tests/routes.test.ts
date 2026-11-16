import { beforeEach, expect, test, vi } from "vitest"
import { testApi } from "@/backend/tests/support/api"
import { signInAs } from "@/backend/tests/support/sign-in"
import { api_failure } from "@/utilities/schemas/failures"

// Someone's own account, through the whole API, whatever their role: their
// name, and the browsers they're signed in on

beforeEach(() => {
    vi.spyOn(console, "info").mockImplementation(() => {})
})

test("sets and clears your name, which the session then says", async () => {
    const api = await testApi()
    const { cookie } = await signInAs(api, "maria@example.com")
    const headers = { headers: { cookie } }

    const named = await api.client.api.account.$patch(
        { json: { name: "  Maria Santos " } },
        headers
    )
    expect(await named.json()).toEqual({ name: "Maria Santos" })
    const session = await api.client.api.auth.session.$get({}, headers)
    expect((await session.json()).user).toMatchObject({
        name: "Maria Santos",
        role: "external"
    })

    const cleared = await api.client.api.account.$patch(
        { json: { name: null } },
        headers
    )
    expect(await cleared.json()).toEqual({ name: null })
})

test("lists where you're signed in, this browser marked, with its browser", async () => {
    const api = await testApi()
    const first = await signInAs(api, "maria@example.com")
    await signInAs(api, "maria@example.com")
    const listed = await api.client.api.account.sessions.$get(
        {},
        { headers: { cookie: first.cookie } }
    )
    expect(listed.status).toBe(200)
    if (listed.status === 200) {
        const { sessions } = await listed.json()
        expect(sessions).toHaveLength(2)
        expect(sessions.filter((session) => session.current)).toHaveLength(1)
        expect(sessions[0]?.user_agent).toBe("Test browser")
    }
})

test("signs out another browser, but not this one, nor anyone else's", async () => {
    const api = await testApi()
    const here = await signInAs(api, "maria@example.com")
    const elsewhere = await signInAs(api, "maria@example.com")
    const someone = await signInAs(api, "jun@example.com")
    const headers = { headers: { cookie: here.cookie } }

    const sessionsOf = async (cookie: string) => {
        const listed = await api.client.api.account.sessions.$get(
            {},
            { headers: { cookie } }
        )
        if (listed.status !== 200) {
            throw new Error("Listing sessions failed")
        }
        return (await listed.json()).sessions
    }
    const [current, other] = [
        ...(await sessionsOf(here.cookie)).filter((each) => each.current),
        ...(await sessionsOf(here.cookie)).filter((each) => !each.current)
    ]
    const [theirs] = await sessionsOf(someone.cookie)
    if (current === undefined || other === undefined || theirs === undefined) {
        throw new Error("Each sign-in should have its session")
    }

    const this_one = await api.client.api.account.sessions[":id"].$delete(
        { param: { id: current.id } },
        headers
    )
    expect(this_one.status).toBe(409)
    expect(api_failure.parse(await this_one.json()).error.reason).toBe(
        "current"
    )

    const not_yours = await api.client.api.account.sessions[":id"].$delete(
        { param: { id: theirs.id } },
        headers
    )
    expect(not_yours.status).toBe(404)

    const ended = await api.client.api.account.sessions[":id"].$delete(
        { param: { id: other.id } },
        headers
    )
    expect(ended.status).toBe(200)
    const gone = await api.client.api.auth.session.$get(
        {},
        { headers: { cookie: elsewhere.cookie } }
    )
    expect(await gone.json()).toEqual({ user: null })
})

test("signs out everywhere else, keeping this browser", async () => {
    const api = await testApi()
    const here = await signInAs(api, "maria@example.com")
    await signInAs(api, "maria@example.com")
    await signInAs(api, "maria@example.com")

    const ended = await api.client.api.account.sessions[
        "sign-out-others"
    ].$post({}, { headers: { cookie: here.cookie } })
    expect(await ended.json()).toEqual({ ended: 2 })
    const still = await api.client.api.auth.session.$get(
        {},
        { headers: { cookie: here.cookie } }
    )
    expect((await still.json()).user?.email).toBe("maria@example.com")
})
