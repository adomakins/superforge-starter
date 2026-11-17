/**
 * Who can sign in, and who's one of the business's own from the first time
 * they do: the two questions START-HERE.md asks the owner, whose answers go
 * in ACCESS below. They're code rather than Railway variables, so a dev
 * server signs in the way production does, and they change with a commit.
 * Every route sees them on `context.var.access`, and a test can hand its
 * own (backend/tests/support/api.ts).
 */
export type Access = {
    /**
     * `anyone`: signing in for the first time makes the person, as
     * `external`, for a business whose customers sign in. `listed`: only
     * someone already on the dashboard's People screen, or in
     * `internal_emails`, can sign in, for an app only the business's own
     * people use.
     */
    sign_in: "anyone" | "listed"
    /**
     * The addresses that are `internal` from the first time they sign in,
     * like the owner's, lowercased. After that, roles change on the People
     * screen: taking an address off this list changes no one.
     */
    internal_emails: readonly string[]
}

/** This app's. START-HERE.md sets them. */
export const ACCESS: Access = {
    sign_in: "anyone",
    internal_emails: []
}

/** Whether `email` is internal from its first sign-in. */
export function listedAsInternal(access: Access, email: string) {
    return access.internal_emails.some(
        (listed) => listed.trim().toLowerCase() === email
    )
}
