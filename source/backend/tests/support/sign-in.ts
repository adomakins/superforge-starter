import { eq } from "drizzle-orm"
import { users } from "@/database/schema"
import type { Role } from "@/utilities/schemas/users"
import type { testApi } from "./api"

/**
 * Signs `email` in through the whole API, as a person does, with Infra's
 * stand-in, which answers the code, then gives them `role`: what a route's
 * test calls to act as someone. Answers their user's id and the `cookie`
 * header their browser would send.
 */
export async function signInAs(
    api: Awaited<ReturnType<typeof testApi>>,
    email: string,
    role: Role = "external"
) {
    const started = await api.client.api.auth.start.$post({ json: { email } })
    if (started.status !== 200) {
        throw new Error("The test's sign-in didn't start")
    }
    const { development } = await started.json()
    if (development === null) {
        throw new Error("The stand-in answers the code")
    }
    const verified = await api.client.api.auth.verify.$post(
        { json: { email, code: development.code } },
        { headers: { "User-Agent": "Test browser" } }
    )
    if (verified.status !== 200) {
        throw new Error("The test's sign-in didn't verify")
    }
    const { user } = await verified.json()
    await api.database.update(users).set({ role }).where(eq(users.id, user.id))
    return { id: user.id, cookie: sessionCookie(verified) }
}

/** The `session` cookie a response set, as a request sends it back. */
export function sessionCookie(response: Response) {
    const set = response.headers.get("Set-Cookie") ?? ""
    const match = /(?:^|,\s*)session=([^;]*)/.exec(set)
    if (match?.[1] === undefined) {
        throw new Error("The response set no session cookie")
    } else {
        return `session=${match[1]}`
    }
}
