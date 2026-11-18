import { z } from "zod"
import {
    app_user_id,
    browser_id,
    event_name,
    event_properties,
    page_path
} from "@/utilities/schemas/events"

// What the app's server tells Infra happened, through `sendEvents`
// (index.ts): what only the server knows, like a sign-up or a payment.
// The pages send their own (frontend/visitors/). README.md, "Events", has
// the call.

/** How many events one call can carry, as Infra takes them. */
export const EVENTS_A_CALL = 100

/** How big one call's body can be, in bytes, as Infra takes it. */
export const EVENTS_BODY_LIMIT = 64 * 1024

/**
 * One event from the server: its name, and whatever else is known of it.
 * `at` is when it happened, now when it's left out; `user` the app's own
 * ID for whoever did it, never their email. The stand-in checks it as
 * Infra does (stand-in.ts).
 */
export const server_event = z.object({
    name: event_name,
    at: z.date().optional(),
    path: page_path.optional(),
    visitor: browser_id.optional(),
    session: browser_id.optional(),
    user: app_user_id.optional(),
    properties: event_properties.optional()
})
export type ServerEvent = z.input<typeof server_event>

/** One call's events, as Infra checks them. */
export const server_events = z.array(server_event).min(1).max(EVENTS_A_CALL)

/** A call's body, as Infra takes it: each event's time as ISO 8601. */
export function eventsBody(events: ServerEvent[]) {
    return {
        events: events.map(({ at, ...event }) =>
            at === undefined ? event : { ...event, at: at.toISOString() }
        )
    }
}
