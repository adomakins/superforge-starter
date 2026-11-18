import { z } from "zod"

/**
 * Whether the site asks a visitor before it remembers their browser: the
 * owner's choice, which START-HERE.md sets.
 *
 * - `"ask"`: the consent banner asks each visitor
 *   (components/site/consent-banner.tsx). Until they accept, and after they
 *   decline, the pages keep nothing on their device and send only views,
 *   leaves and errors, with no IDs: anonymous counts.
 * - `"assume"`: no banner, and a lasting visitor ID from the first visit,
 *   for a business whose customers no consent rules cover.
 *
 * README.md here has what each records.
 */
export const CONSENT: ConsentSetting = "ask"

export type ConsentSetting = "ask" | "assume"

/**
 * What a visitor answered the banner, kept on their device so they aren't
 * asked again: a refusal too.
 */
export const consent_answer = z.enum(["accepted", "declined"])
export type ConsentAnswer = z.infer<typeof consent_answer>

/**
 * Whether the pages may remember this browser: keep its IDs, put them on
 * its events, keep what's waiting to be sent, and send its clicks and the
 * app's own events. A visitor who declined is never remembered, even if
 * the setting has since become `"assume"`.
 */
export function remembering(
    setting: ConsentSetting,
    answer: ConsentAnswer | null
) {
    if (answer === "declined") {
        return false
    } else if (setting === "assume") {
        return true
    } else {
        return answer === "accepted"
    }
}

/** Whether the banner asks: only when the setting is `"ask"`, once. */
export function asking(setting: ConsentSetting, answer: ConsentAnswer | null) {
    return setting === "ask" && answer === null
}
