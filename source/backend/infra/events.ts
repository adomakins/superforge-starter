import { z } from "zod"
import {
    app_user_id,
    browser_id,
    EVENTS_A_CALL,
    event_name,
    event_properties,
    page_path
} from "@/utilities/schemas/events"

// What the app's server tells Infra happened, through `sendEvents`
// (index.ts): what only the server knows, like a sign-up or a payment.
// The pages' events go through `sendVisit` instead (visits.ts). README.md,
// "Events", has the call.

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
