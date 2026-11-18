// Whom the site remembers between visits: the owner's choice, which
// START-HERE.md sets. The server sends it to Infra with every batch of the
// pages' events (backend/visits/), and Infra applies it by each visitor's
// answer and where they are, and says whether to remember them and whether
// to ask (backend/infra/README.md, "Events").

/** Each way the site can treat its visitors. */
export const VISITOR_MODES = ["remember", "ask-in-eu", "ask", "never"] as const
export type VisitorMode = (typeof VISITOR_MODES)[number]

/**
 * Whom the site remembers, by a lasting `visitor` cookie its server sets:
 *
 * - `"remember"`, as it ships: everyone who hasn't declined, with no
 *   banner.
 * - `"ask-in-eu"`: the banner asks visitors where GDPR applies (the EU,
 *   the EEA and the UK, by their IP address, and anyone Infra can't
 *   place), and everyone else is remembered: for a business outside the
 *   EU that cares.
 * - `"ask"`: the banner asks everyone, and only those who accept are
 *   remembered: for a business based in the EU.
 * - `"never"`: no one is remembered and no one is asked, and the server
 *   sets no cookie.
 *
 * A visitor who isn't remembered is still counted, as one visitor a day
 * (frontend/visitors/README.md).
 */
export const VISITOR_MODE: VisitorMode = "remember"
