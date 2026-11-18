import { z } from "zod"

// An event's fields, as Superforge Infra checks them: what the pages send
// (frontend/visitors/) and what the server sends (backend/infra/), each
// checked here the same as Infra will, so a wrong one is caught in the app
// rather than refused by Infra. backend/infra/README.md, "Events", has the
// calls.

/**
 * An event's name: lowercase words joined by hyphens, at most 64
 * characters, like `view` or `booked-a-call`.
 */
export const event_name = z
    .string()
    .max(64)
    .regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/)

/**
 * The rest of an event, flat: at most 32, each named in at most 64
 * characters, and a string of at most 1,000 characters, a number, a
 * boolean or null.
 */
export const event_properties = z
    .record(
        z.string().min(1).max(64),
        z.union([z.string().max(1000), z.number(), z.boolean(), z.null()])
    )
    .refine((properties) => Object.keys(properties).length <= 32, {
        message: "More than 32 properties"
    })
export type EventProperties = z.infer<typeof event_properties>

/**
 * A browser's lasting visitor ID, or its visit's: 8 to 64 letters, digits,
 * `_` or `-`.
 */
export const browser_id = z.string().regex(/^[\w-]{8,64}$/)

/**
 * The app's own ID for whoever is signed in, at most 128 characters. Never
 * an email: Infra keeps no app's users.
 */
export const app_user_id = z
    .string()
    .trim()
    .min(1)
    .max(128)
    .refine((id) => !id.includes("@"), { message: "An email, not an ID" })

/** A page's path, starting `/`, without its query or fragment. */
export const page_path = z
    .string()
    .max(2048)
    .regex(/^\/[^?#]*$/)
