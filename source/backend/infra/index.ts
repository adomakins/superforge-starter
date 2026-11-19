import type { z } from "zod"
import type { SignInProof } from "@/utilities/schemas/auth"
import type {
    comment_refused,
    events_refused,
    kept_comment,
    sent_events,
    sent_visit,
    start_refused,
    started_sign_in,
    verified_sign_in,
    verify_refused
} from "./answers"
import { chooseInfra } from "./choose"
import type { FiledComment } from "./comments"
import type { ServerEvent } from "./events"
import type { Visit } from "./visits"

// Superforge Infra, the backend services this app runs on, through the one
// wrapper every route and step calls: never a bare `fetch` to it anywhere
// else (workbench/writing-code.md, "A call to an outside service"). For now
// it's sign-in, where Infra emails a visitor a code and a link, and says
// whether what they brought back is right; events, what happened in the
// app, for the owner's dashboard: the pages' and the server's; and
// comments, what the app's people said about it from the toolbar. The app
// keeps its own users and sessions (backend/auth/). README.md here has the
// calls.

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
    /**
     * Tells Infra what happened in the app that only the server knows, like
     * a sign-up or a payment: at most 100 events (events.ts). Answers how
     * many Infra kept, none with a test key. A caller sends it without
     * waiting on it where a person is waiting, and logs a failure: an event
     * is never worth failing a request over.
     */
    sendEvents(
        events: ServerEvent[]
    ): AsyncOperation<SentEvents, EventsRefused | InfraUnavailable>
    /**
     * Sends Infra a batch of one visitor's page events, which their page
     * posted to the app's own /api/visits, with who they are, what they
     * agreed to and where they are (visits.ts). Infra decides by the app's
     * mode, their answer and their country whether the app remembers them
     * and whether the page asks them, and answers both. It's never retried:
     * events sent twice are kept twice.
     */
    sendVisit(
        visit: Visit
    ): AsyncOperation<SentVisit, EventsRefused | InfraUnavailable>
    /**
     * Sends Infra a comment someone signed in wrote about an element of a
     * page, which the toolbar posted to the app's own /api/comments, with
     * who they are (comments.ts). Infra keeps it, a test key's too, and
     * answers its ID. It's never retried: a comment sent twice is kept
     * twice.
     */
    fileComment(
        comment: FiledComment
    ): AsyncOperation<KeptComment, CommentRefused | InfraUnavailable>
}

// What Infra answers, as the app sees it (answers.ts has each field)
export type StartedSignIn = z.output<typeof started_sign_in>
export type StartRefused = z.output<typeof start_refused>
export type VerifyRefused = z.output<typeof verify_refused>
export type SentEvents = z.output<typeof sent_events>
export type SentVisit = z.output<typeof sent_visit>
export type EventsRefused = z.output<typeof events_refused>
export type KeptComment = z.output<typeof kept_comment>
export type CommentRefused = z.output<typeof comment_refused>
export type { FiledComment, ServerEvent, Visit }

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
