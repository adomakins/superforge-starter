import type { Context } from "hono"
import { z } from "zod"

// What Infra needs to know about who's signing in, from the request

// An IPv4 or IPv6 address, as Infra takes one
const ip_address = z.union([z.ipv4(), z.ipv6()])

/**
 * The visitor's IP address, which Infra's limits count by: the
 * `X-Real-IP` header Railway's proxy sets, since the connection's own
 * address is the proxy's. A request without it, like one to a dev server
 * or to the build on this computer, counts as this computer's own.
 */
export function visitorIp(context: Context) {
    const parsed = ip_address.safeParse(context.req.header("X-Real-IP"))
    if (parsed.success) {
        return parsed.data
    } else {
        if (!import.meta.env.DEV) {
            console.warn(
                "A sign-in came without Railway's X-Real-IP, so it counts as 127.0.0.1",
                { header: context.req.header("X-Real-IP") ?? null }
            )
        }
        return "127.0.0.1"
    }
}

/**
 * Where the app is, for the link in the sign-in email: the request's own
 * origin. Infra builds the link only for a domain the project lists, or
 * localhost, so a forged Host header can't send anyone elsewhere; behind
 * Railway's proxy the origin says http, which Infra makes https.
 */
export function appOrigin(context: Context) {
    return new URL(context.req.url).origin
}
