import { z } from "zod"
import { email_address } from "./auth"

// The people who can sign in, as the dashboard and the routes under
// /api/users check them (backend/users/routes.ts): the same schemas on both
// sides, so a form says what's wrong before it sends.

/**
 * Who someone is to the business: one of its own (`internal`), who sees
 * the whole dashboard, or anyone else (`external`), a customer or a client,
 * who sees only their own account. A business that needs more adds them
 * here, like `technician` or `lead`, and to INTERNAL_ROLES when they're its
 * own; the column's check (database/schema.ts) is made from this list, so
 * the migration `pnpm database:generate` writes changes it with it.
 */
export const ROLES = ["internal", "external"] as const
export const user_role = z.enum(ROLES)
export type Role = z.infer<typeof user_role>

/**
 * The roles that see the business's side of the dashboard (the people, the
 * workflows), on top of their own account. Everyone else sees only theirs.
 */
export const INTERNAL_ROLES: readonly Role[] = ["internal"]

/** Whether someone in `role` sees the business's side of the dashboard. */
export function isInternal(role: Role) {
    return INTERNAL_ROLES.includes(role)
}

/** Someone's name, as they'd like it shown: trimmed, and not too long. */
export const person_name = z.string().trim().min(1).max(120)

/** What changes someone's own details, on their account page. */
export const account_change = z.object({ name: person_name.nullable() })

/**
 * Someone added by hand, before they've signed in: their address, a name
 * if it's known, and their role.
 */
export const user_addition = z.object({
    email: email_address,
    name: person_name.optional(),
    role: user_role
})

/** What an internal person can change about someone else: their role. */
export const user_change = z.object({ role: user_role })
