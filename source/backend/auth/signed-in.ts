import type { Context } from "hono"
import { deleteCookie, getCookie, setCookie } from "hono/cookie"
import { createFactory } from "hono/factory"
import type { Database } from "@/database"
import { isInternal } from "@/utilities/schemas/users"
import type { ApiEnvironment } from "../context"
import { failure } from "../failures"
import {
    liveSession,
    renewSession,
    SESSION_LIFETIME,
    type SessionUser
} from "./sessions"

// Who's signed in: the `session` cookie, and the middleware that reads it.
// This is the one place that decides who's signed in, so a route that
// needs the user takes `signedIn` (or `maybeSignedIn`, or `internalOnly`)
// and reads `context.var.user`; nothing else reads the cookie.

const COOKIE = "session"

/** This browser's session token, from its cookie, if it has one. */
export function sessionToken(context: Context) {
    return getCookie(context, COOKIE)
}

/**
 * Sets the session's cookie for its whole lifetime, as it starts and each
 * time it's renewed: the browser drops it when this runs out, whatever the
 * session has left.
 */
export function setSessionCookie(context: Context, token: string) {
    setCookie(context, COOKIE, token, {
        httpOnly: true,
        secure: secureCookie(context.req.url),
        // Sent when someone follows a link here, but not with a request
        // another site's page makes, so another site can't act as them
        sameSite: "Lax",
        path: "/",
        maxAge: SESSION_LIFETIME / 1000
    })
}

/** Clears the session's cookie, as signing out does. */
export function clearSessionCookie(context: Context) {
    deleteCookie(context, COOKIE, {
        path: "/",
        secure: secureCookie(context.req.url)
    })
}

/**
 * Whether a cookie set in answer to `request_url` is `Secure`: everywhere
 * but plain http on this computer, or a dev server reached over plain http
 * from another, where a browser won't keep a Secure cookie: the build run
 * with `pnpm preview`, or `pnpm dev`. Behind Railway's proxy a request's
 * own address says http, though the browser's said https, so the protocol
 * alone can't say. The visitor's cookies follow it too (visits/cookies.ts).
 */
export function secureCookie(request_url: string) {
    const { protocol, hostname } = new URL(request_url)
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(hostname)
    return !(protocol === "http:" && (local || import.meta.env.DEV))
}

/** The session a request came with, as a route behind `signedIn` sees it. */
export type RequestSession = { id: string }

type SignedIn = {
    Variables: ApiEnvironment["Variables"] & {
        user: SessionUser
        session: RequestSession
    }
}

/**
 * Lets a request through only with a live session, and puts its user on
 * `context.var.user`, and the session's id on `context.var.session`;
 * without one, it's answered 401 `signed-out`. It also renews the session,
 * keeping the same token, so coming back keeps someone signed in. One that
 * has ended stays ended.
 */
export const signedIn = createFactory<SignedIn>().createMiddleware(
    // From a factory rather than plain `createMiddleware`, so the 401 below
    // is inferred into each route's type and the typed client knows it
    async (context, next) => {
        const token = sessionToken(context)
        const session =
            token === undefined
                ? undefined
                : await liveSession(context.var.database, token)
        if (token === undefined || session === undefined) {
            return failure(context, 401, "signed-out", "Sign in first")
        } else {
            context.set("user", session.user)
            context.set("session", { id: session.id })
            await renewed(
                context,
                context.var.database,
                token,
                session.renewable,
                next
            )
        }
    }
)

/**
 * `signedIn` for the business's side of the dashboard: only someone whose
 * role is one of its own (`isInternal`, utilities/schemas/users.ts) gets
 * through, and anyone else signed in is answered 403 `not-internal`.
 */
export const internalOnly = createFactory<SignedIn>().createMiddleware(
    async (context, next) => {
        const token = sessionToken(context)
        const session =
            token === undefined
                ? undefined
                : await liveSession(context.var.database, token)
        if (token === undefined || session === undefined) {
            return failure(context, 401, "signed-out", "Sign in first")
        } else if (!isInternal(session.user.role)) {
            return failure(
                context,
                403,
                "not-internal",
                "Only the business's own people can see this"
            )
        } else {
            context.set("user", session.user)
            context.set("session", { id: session.id })
            await renewed(
                context,
                context.var.database,
                token,
                session.renewable,
                next
            )
        }
    }
)

/**
 * `signedIn` for a route anyone may call, like the one every page asks who's
 * signed in: `context.var.user` is null for a visitor, rather than the
 * request being refused, so a visitor's browser logs no failed request. A
 * user's session is renewed the same way.
 */
export const maybeSignedIn = createFactory<{
    Variables: ApiEnvironment["Variables"] & { user: SessionUser | null }
}>().createMiddleware(async (context, next) => {
    const token = sessionToken(context)
    const session =
        token === undefined
            ? undefined
            : await liveSession(context.var.database, token)
    if (token === undefined || session === undefined) {
        context.set("user", null)
        await next()
    } else {
        context.set("user", session.user)
        await renewed(
            context,
            context.var.database,
            token,
            session.renewable,
            next
        )
    }
})

// Runs the route, renewing the session first when it's due, and sets the
// renewed cookie after the route, since a header set before it is lost on
// a plain `Response`
async function renewed(
    context: Context,
    database: Database,
    token: string,
    renewable: boolean,
    next: () => Promise<void>
) {
    const renewing = renewable && (await renewSession(database, token))
    await next()
    if (renewing) {
        setSessionCookie(context, token)
    }
}
