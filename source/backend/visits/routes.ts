import { Hono } from "hono"
import { bodyLimit } from "hono/body-limit"
import { EVENTS_BODY_LIMIT } from "@/utilities/schemas/events"
import { consent_answer, page_batch } from "@/utilities/schemas/visits"
import { maybeSignedIn } from "../auth/signed-in"
import { visitorIp, visitorUserAgent } from "../auth/visitor"
import type { ApiEnvironment } from "../context"
import { failure, validated } from "../failures"
import {
    forgetVisitor,
    keepConsent,
    keptConsent,
    keptVisitorId,
    rememberVisitor
} from "./cookies"

/**
 * What visitors do on the site's pages, under /api/visits: the pages'
 * script (frontend/visitors/) posts its events here, never to Infra, so an
 * ad blocker sees nothing to block, and the key stays on the server. The
 * server sends them on with who the visitor is, what they answered and
 * where they are, and Infra decides by `context.var.visitor_mode`
 * (utilities/visitors.ts) whether the app remembers them, with the
 * `visitor` cookie (cookies.ts), and whether their page asks them first
 * (backend/infra/README.md, "Events").
 */
export const visitRoutes = new Hono<ApiEnvironment>()
    // A batch of the page's events, `{ sent_at, events }`. Answers whether
    // the page asks the visitor, and sets, renews or clears their
    // `visitor` cookie as Infra says. An Infra that's down or refuses the
    // batch loses it, which is logged, and changes nothing on the browser:
    // the page has nothing to do about it, and events sent twice are kept
    // twice, so it isn't asked to send them again.
    .post(
        "/visits",
        bodyLimit({
            maxSize: EVENTS_BODY_LIMIT,
            onError: (context) =>
                failure(
                    context,
                    413,
                    "too-large",
                    "A batch of a page's events is at most 64 KB"
                )
        }),
        validated("json", page_batch),
        maybeSignedIn,
        async (context) => {
            const { sent_at, events } = context.req.valid("json")
            const mode = context.var.visitor_mode
            const kept_id = keptVisitorId(context)
            // The ID the cookie holds, or a new one, which the cookie holds
            // once Infra says to remember them; none at all in `never`
            const id =
                mode === "never" ? null : (kept_id ?? crypto.randomUUID())
            const sent = await context.var.infra.sendVisit({
                mode,
                visitor: {
                    id,
                    consent: keptConsent(context),
                    user: context.var.user?.id ?? null,
                    ip: visitorIp(context),
                    user_agent: visitorUserAgent(context)
                },
                sent_at,
                events
            })
            if (!sent.ok) {
                console.warn(
                    "A page's events didn't reach Infra, and are lost",
                    {
                        reason: sent.error.reason,
                        events: events.length
                    }
                )
                return context.json({ ask: false }, 200)
            }

            const { remembered, ask } = sent.data
            if (remembered && id !== null) {
                // Set, or renewed for another 400 days
                rememberVisitor(context, id)
            } else if (!remembered && kept_id !== undefined) {
                forgetVisitor(context)
            }
            return context.json({ ask }, 200)
        }
    )

    // What the visitor answered the banner, kept in `visitor_consent`, which
    // every batch after it sends Infra. Declining forgets their `visitor`
    // cookie at once; accepting lets the next batch's answer set it.
    .post(
        "/visits/consent",
        validated("json", consent_answer),
        async (context) => {
            const { consent } = context.req.valid("json")
            keepConsent(context, consent)
            if (consent === "declined") {
                forgetVisitor(context)
            }
            return context.body(null, 204)
        }
    )
