import { expect, onTestFinished, test, vi } from "vitest"
import { testApi } from "@/backend/tests/support/api"
import { connect } from "@/database"
import { api_failure } from "@/utilities/schemas/failures"

// The health check, the way a route is tested: the whole API on a database
// of the test's own (`testApi()`), called through the typed client

test("GET /api/health answers once the database does", async () => {
    const { client } = await testApi()
    const response = await client.api.health.$get()
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })
})

test("GET /api/health fails as every route fails when the database doesn't answer", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    // A database where nothing listens
    const database = connect("postgres://127.0.0.1:1/nowhere", 1)
    onTestFinished(() => database.$client.end())

    const { client } = await testApi({ database })
    const response = await client.api.health.$get()
    expect(response.status).toBe(503)
    const { error } = api_failure.parse(await response.json())
    expect(error.reason).toBe("database-unreachable")
})
