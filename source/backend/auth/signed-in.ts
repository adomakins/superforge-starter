import type { Context } from "hono"
import { deleteCookie, getCookie, setCookie } from "hono/cookie"
import { createFactory } from "hono/factory"
import type { Database } from "@/database"
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
// needs the user takes `signedIn` (or `maybeSignedIn`) and reads
// `context.var.user`; nothing else reads the cookie.

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

// Everywhere but plain-http localhost, where Safari won't keep a Secure
// cookie: a dev server, or the build run with `pnpm preview`. Behind
// Railway's proxy a request's own address says http, so the protocol alone
// can't say.
function secureCookie(request_url: string) {
    const { protocol, hostname } = new URL(request_url)
    const local = hostname === "localhost" || hostname === "127.0.0.1"
    return !(protocol === "http:" && local)
}

/**
 * Lets a request through only with a live session, and puts its user on
 * `context.var.user`; without one, it's answered 401 `signed-out`. It also
 * renews the session, keeping the same token, so coming back keeps someone
 * signed in. One that has ended stays ended.
 */
export const signedIn = createFactory<{
    Variables: ApiEnvironment["Variables"] & { user: SessionUser }
    // From a factory rather than plain `createMiddleware`, so the 401 below
    // is inferred into each route's type and the typed client knows it
}>().createMiddleware(async (context, next) => {
    const token = sessionToken(context)
    const session =
        token === undefined
            ? undefined
            : await liveSession(context.var.database, token)
    if (token === undefined || session === undefined) {
        return failure(context, 401, "signed-out", "Sign in first")
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
