import { afterEach, expect, test, vi } from "vitest"
import { MINUTE } from "@/utilities/primitives/durations"
import { standInInfra } from "../stand-in"

// The stand-in treats a code and a link as Infra's test mode does, so what
// the tests and a dev server without a test key see is what a test key
// gets from the real one

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
