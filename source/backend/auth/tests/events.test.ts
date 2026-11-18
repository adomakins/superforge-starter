import { expect, test, vi } from "vitest"
import type { Infra, ServerEvent } from "@/backend/infra"
import { standInInfra } from "@/backend/infra/stand-in"
import { testApi } from "@/backend/tests/support/api"
import { users } from "@/database/schema"

// What signing in tells Infra: a `signed-up` event when a sign-in makes
// someone new, with their user's ID and never their email, and nothing
// else. Infra being slow or down never holds signing in up.

const EMAIL = "ada@example.com"

// The stand-in, with what was sent through it, or `sendEvents` in place of
// its own
function recordingInfra(sendEvents?: Infra["sendEvents"]) {
    const sent: ServerEvent[][] = []
    const stand_in = standInInfra()
    const infra: Infra = {
        startSignIn: (request) => stand_in.startSignIn(request),
        verifySignIn: (proof) => stand_in.verifySignIn(proof),
        sendEvents: async (events) => {
            sent.push(events)
            return await (sendEvents ?? stand_in.sendEvents)(events)
        }
    }
    return { infra, sent }
}

// Signs EMAIL in by its code, and answers the verify's response
async function signIn(api: Awaited<ReturnType<typeof testApi>>) {
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
    return await api.client.api.auth.verify.$post({
        json: { email: EMAIL, code: development.code }
    })
}

test("a first sign-in tells Infra someone signed up, by their ID, once", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {})
    const { infra, sent } = recordingInfra()
    const api = await testApi({ infra })
    await signIn(api)
    await signIn(api)

    const [user] = await api.database.select().from(users)
    expect(sent).toEqual([[{ name: "signed-up", user: user?.id }]])
    expect(JSON.stringify(sent)).not.toContain(EMAIL)
})

test("an Infra that's down still signs someone new in, and says so in the logs", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {})
    const warned = vi.spyOn(console, "warn").mockImplementation(() => {})
    const { infra } = recordingInfra(async () => ({
        ok: false,
        error: { reason: "unavailable" }
    }))
    const api = await testApi({ infra })
    const verified = await signIn(api)
    expect(verified.status).toBe(200)
    await vi.waitFor(() => {
        expect(warned).toHaveBeenCalledWith(
            "The sign-up's event didn't reach Infra",
            expect.objectContaining({ reason: "unavailable" })
        )
    })
})

test("an Infra that never answers doesn't hold up the sign-in", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {})
    const { infra, sent } = recordingInfra(() => new Promise(() => {}))
    const api = await testApi({ infra })
    const verified = await signIn(api)
    expect(verified.status).toBe(200)
    expect(sent).toHaveLength(1)
})
