import { z } from "zod"
import { app_user_id, browser_id } from "@/utilities/schemas/events"
import { page_batch, visitor_consent } from "@/utilities/schemas/visits"
import { VISITOR_MODES } from "@/utilities/visitors"
import { ip_address } from "../auth/visitor"

// What the app's server sends Infra for its pages, through `sendVisit`
// (index.ts): a batch of one visitor's page events, which their page
// posted to the app's own /api/visits (backend/visits/), with who the
// visitor is, what they agreed to and where they are. README.md,
// "Events", has the call.

/** What a visitor answered the banner, or `unasked` before they have. */
export const visit_consent = z.union([z.literal("unasked"), visitor_consent])
export type VisitConsent = z.infer<typeof visit_consent>

/**
 * One call's body, as Infra checks it: the app's mode
 * (utilities/visitors.ts), the visitor, and the page's batch. The stand-in
 * checks it as Infra does (stand-in.ts).
 */
export const visit = page_batch.extend({
    mode: z.enum(VISITOR_MODES),
    visitor: z.object({
        // The ID the `visitor` cookie holds, or a new one the app would
        // set: null when the app's mode is `never`
        id: browser_id.nullable(),
        consent: visit_consent,
        // The app's own ID for whoever is signed in, never their email
        user: app_user_id.nullable(),
        // For their country, and to count them when they aren't
        // remembered: Infra never keeps either
        ip: ip_address,
        user_agent: z.string().max(1024)
    })
})
export type Visit = z.infer<typeof visit>
