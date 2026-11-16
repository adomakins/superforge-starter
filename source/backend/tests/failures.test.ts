import { Hono } from "hono"
import { testClient } from "hono/testing"
import { expect, test, vi } from "vitest"
import { z } from "zod"
import { answerNotFound, answerUnexpected, validated } from "@/backend/failures"
import { testApi } from "@/backend/tests/support/api"
import { api_failure } from "@/utilities/schemas/failures"

// Each way a route fails, answered in the one shape every failure takes
// (utilities/schemas/failures.ts), on an app of the test's own with the
// API's handlers, and on the API itself for what index.ts wires

const app = new Hono()
    .basePath("/api")
    .notFound(answerNotFound)
    .onError(answerUnexpected)
    .post(
        "/things",
        validated("json", z.object({ name: z.string().min(1) })),
        (context) => context.json({ named: context.req.valid("json").name })
    )
    .get("/broken", () => {
        throw new Error("A bug")
    })

test("input that fits reaches the route, checked", async () => {
    const response = await testClient(app).api.things.$post({
        json: { name: "First" }
    })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ named: "First" })
})

test("input that doesn't fit is answered 400, with what didn't fit", async () => {
    const response = await testClient(app).api.things.$post({
        json: { name: "" }
    })
    expect(response.status).toBe(400)
    const { error } = api_failure.parse(await response.json())
    expect(error.reason).toBe("invalid")
    expect(error.issues?.map((issue) => issue.path)).toEqual(["name"])
})

test("a route that throws is answered 500, and logged", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {})
    const response = await app.request("/api/broken")
    expect(response.status).toBe(500)
    const { error } = api_failure.parse(await response.json())
    expect(error.reason).toBe("unexpected")
    expect(logged).toHaveBeenCalledWith(
        "A route threw",
        expect.objectContaining({ path: "/api/broken" })
    )
})

test("the API answers a path no route answers 404, uncached", async () => {
    const { api } = await testApi()
    const response = await api.request("/api/nowhere")
    expect(response.status).toBe(404)
    expect(response.headers.get("Cache-Control")).toBe("no-store")
    const { error } = api_failure.parse(await response.json())
    expect(error.reason).toBe("not-found")
})
