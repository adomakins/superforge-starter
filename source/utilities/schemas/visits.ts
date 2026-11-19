import { z } from "zod"
import {
    EVENTS_A_CALL,
    event_name,
    event_properties,
    page_path
} from "./events"

// What the pages' script (frontend/visitors/) posts to the app's own
// /api/visits (backend/visits/), which checks it with the same schemas
// before it sends it on to Infra with who the visitor is.

/**
 * An event as a page sends it: `at` in milliseconds by the browser's
 * clock, and nothing of who the visitor is, which the server adds.
 */
export const page_event = z.object({
    name: event_name,
    at: z.number().int().nonnegative(),
    path: page_path,
    properties: event_properties
})
export type PageEvent = z.infer<typeof page_event>

/**
 * What one call to /api/visits carries: when the page sent it, by the
 * browser's clock, which tells Infra how far that clock is off, and one to
 * 100 events.
 */
export const page_batch = z.object({
    sent_at: z.number().int().nonnegative(),
    events: z.array(page_event).min(1).max(EVENTS_A_CALL)
})
export type PageBatch = z.infer<typeof page_batch>

/** What a visitor answered the banner, which the `visitor_consent` cookie keeps. */
export const visitor_consent = z.enum(["given", "declined"])
export type VisitorConsent = z.infer<typeof visitor_consent>

/** The banner's answer, as the page posts it to /api/visits/consent. */
export const consent_answer = z.object({ consent: visitor_consent })
