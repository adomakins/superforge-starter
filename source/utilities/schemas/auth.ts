import { z } from "zod"

// What signing in takes, checked the same by the sign-in form before it
// sends and by the routes under /api/auth (backend/auth/routes.ts), which
// check it again whatever the form said. Infra checks an address and a code
// the same way.

/** An email address as the app keeps it: trimmed, lowercased and checked. */
export const email_address = z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email().max(254))

/**
 * A sign-in email's six-digit code, forgiving the spaces a pasted code can
 * carry (`123 456`).
 */
export const sign_in_code = z
    .string()
    .transform((value) => value.replace(/\s/g, ""))
    .pipe(z.string().regex(/^\d{6}$/))

/**
 * A sign-in link's token: what follows `#` in the link the email holds
 * (`/sign-in#<token>`), 32 random bytes in base64url.
 */
export const sign_in_token = z.string().regex(/^[\w-]{43}$/)

/** What starts a sign-in: the address to email a code and a link to. */
export const sign_in_start = z.object({ email: email_address })

/**
 * What finishes one: the code the visitor typed, with the address it went
 * to, or the token from the link they opened.
 */
export const sign_in_verify = z.union([
    z.object({ email: email_address, code: sign_in_code }),
    z.object({ token: sign_in_token })
])
export type SignInProof = z.infer<typeof sign_in_verify>
