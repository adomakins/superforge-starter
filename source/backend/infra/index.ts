import type { z } from "zod"
import type { SignInProof } from "@/utilities/schemas/auth"
import type {
    start_refused,
    started_sign_in,
    verified_sign_in,
    verify_refused
} from "./answers"
import { chooseInfra } from "./choose"

// Superforge Infra, the backend services this app runs on, through the one
// wrapper every route and step calls: never a bare `fetch` to it anywhere
// else (workbench/writing-code.md, "A call to an outside service"). For now
// it's sign-in: Infra emails a visitor a code and a link, and says whether
// what they brought back is right. The app keeps its own users and
// sessions (backend/auth/). README.md here has the calls.

/** What the app asks of Infra, whichever answers: the real one or the stand-in. */
export type Infra = {
    /**
     * Emails `email` a six-digit code, and a link back to the app's
     * `/sign-in` when `origin` is one of the project's domains or
     * localhost. `ip` is the visitor's, which Infra's limits count.
     */
    startSignIn(request: {
        email: string
        ip: string
        origin: string | null
    }): AsyncOperation<StartedSignIn, StartRefused | InfraUnavailable>
    /**
     * Whose email `proof` is: the code typed with the address it went to,
     * or the link's token. Either works once.
     */
    verifySignIn(
        proof: SignInProof
    ): AsyncOperation<
        z.output<typeof verified_sign_in>,
        VerifyRefused | InfraUnavailable
    >
}

// What Infra answers, as the app sees it (answers.ts has each field)
export type StartedSignIn = z.output<typeof started_sign_in>
export type StartRefused = z.output<typeof start_refused>
export type VerifyRefused = z.output<typeof verify_refused>

/**
 * Infra couldn't be asked: no key in a build, a key it refused, or an
 * answer that didn't come or didn't make sense. Each is logged where it
 * happens, so the visitor only learns that sign-in isn't working.
 */
export type InfraUnavailable = { reason: "unavailable" }

let shared: Infra | undefined

/**
 * The server's Infra, chosen the first time it's asked for (choose.ts): the
 * real one with the secret key in a build, the real one with a test key in
 * a dev server that has one, and the stand-in in a dev server that
 * doesn't. A build never gets the stand-in.
 */
export function appInfra(): Infra {
    if (shared === undefined) {
        shared = chooseInfra({
            development: import.meta.env.DEV,
            environment: process.env,
            checkout: process.cwd()
        }).infra
    }
    return shared
}
