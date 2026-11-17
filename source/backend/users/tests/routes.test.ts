import { beforeEach, expect, test, vi } from "vitest"
import { testApi } from "@/backend/tests/support/api"
import { signInAs } from "@/backend/tests/support/sign-in"
import { sessions } from "@/database/schema"
import { api_failure } from "@/utilities/schemas/failures"

// Everyone who can sign in, through the whole API: only the business's own
// people see them or change them, and no one changes or removes themselves

beforeEach(() => {
    vi.spyOn(console, "info").mockImplementation(() => {})
})

test("only the business's own people see everyone", async () => {
    const api = await testApi()
    const signed_out = await api.client.api.users.$get()
    expect(signed_out.status).toBe(401)

    const customer = await signInAs(api, "maria@example.com")
    const refused = await api.client.api.users.$get(
        {},
        { headers: { cookie: customer.cookie } }
    )
    expect(refused.status).toBe(403)
    expect(api_failure.parse(await refused.json()).error.reason).toBe(
        "not-internal"
    )

    const owner = await signInAs(api, "ada@example.com", "internal")
    const listed = await api.client.api.users.$get(
        {},
        { headers: { cookie: owner.cookie } }
    )
    expect(listed.status).toBe(200)
    if (listed.status === 200) {
        const { users } = await listed.json()
        expect(users.map((user) => user.email).sort()).toEqual([
            "ada@example.com",
            "maria@example.com"
        ])
        expect(users.every((user) => user.sessions === 1)).toBe(true)
    }
})

test("adds someone before they sign in, once", async () => {
    const api = await testApi()
    const owner = await signInAs(api, "ada@example.com", "internal")
    const headers = { headers: { cookie: owner.cookie } }
    const json = { email: " Linus@Example.com ", role: "internal" as const }

    const added = await api.client.api.users.$post({ json }, headers)
    expect(added.status).toBe(201)

    const again = await api.client.api.users.$post({ json }, headers)
    expect(again.status).toBe(409)
    expect(api_failure.parse(await again.json()).error.reason).toBe("taken")

    const listed = await api.client.api.users.$get({}, headers)
    if (listed.status === 200) {
        const { users } = await listed.json()
        const linus = users.find((user) => user.email === "linus@example.com")
        expect(linus).toMatchObject({ role: "internal", signed_in_at: null })
    }
})

test("changes someone's role, but never your own", async () => {
    const api = await testApi()
    const owner = await signInAs(api, "ada@example.com", "internal")
    const customer = await signInAs(api, "maria@example.com")
    const headers = { headers: { cookie: owner.cookie } }

    const promoted = await api.client.api.users[":id"].$patch(
        { param: { id: customer.id }, json: { role: "internal" } },
        headers
    )
    expect(promoted.status).toBe(200)
    const now_internal = await api.client.api.users.$get(
        {},
        { headers: { cookie: customer.cookie } }
    )
    expect(now_internal.status).toBe(200)

    const yourself = await api.client.api.users[":id"].$patch(
        { param: { id: owner.id }, json: { role: "external" } },
        headers
    )
    expect(yourself.status).toBe(409)
    expect(api_failure.parse(await yourself.json()).error.reason).toBe(
        "yourself"
    )

    const nobody = await api.client.api.users[":id"].$patch(
        {
            param: { id: "00000000-0000-4000-8000-000000000000" },
            json: { role: "internal" }
        },
        headers
    )
    expect(nobody.status).toBe(404)
})

test("removes someone, signing them out everywhere, but never yourself", async () => {
    const api = await testApi()
    const owner = await signInAs(api, "ada@example.com", "internal")
    const customer = await signInAs(api, "maria@example.com")
    const headers = { headers: { cookie: owner.cookie } }

    const removed = await api.client.api.users[":id"].$delete(
        { param: { id: customer.id } },
        headers
    )
    expect(removed.status).toBe(200)
    expect(await api.database.select().from(sessions)).toHaveLength(1)
    const session = await api.client.api.auth.session.$get(
        {},
        { headers: { cookie: customer.cookie } }
    )
    expect(await session.json()).toEqual({ user: null })

    const yourself = await api.client.api.users[":id"].$delete(
        { param: { id: owner.id } },
        headers
    )
    expect(yourself.status).toBe(409)
})

test("a role that isn't one is refused", async () => {
    const api = await testApi()
    const owner = await signInAs(api, "ada@example.com", "internal")
    const response = await api.api.request("/api/users", {
        method: "POST",
        headers: { cookie: owner.cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ email: "x@example.com", role: "admin" })
    })
    expect(response.status).toBe(400)
    const { error } = api_failure.parse(await response.json())
    expect(error.issues?.map((issue) => issue.path)).toEqual(["role"])
})
