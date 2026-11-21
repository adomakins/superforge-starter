import Bowser from "bowser"
import { isbot } from "isbot"
import type { Device } from "@/utilities/visitors"

// What a visitor's browser says of itself in its User-Agent, which the
// server reads and doesn't keep: whether it's a bot (`isbot`, Umami's
// choice), and what kind of device, which browser and which OS (`bowser`)

/** What's kept of a visitor's User-Agent. */
export type BrowserFacts = {
    device: Device | null
    browser: string | null
    os: string | null
}

/**
 * What `user_agent` says, or null for a bot's, or for none at all, which
 * no real browser sends.
 */
export function describeBrowser(user_agent: string): BrowserFacts | null {
    if (user_agent.trim() === "" || isbot(user_agent)) {
        return null
    }
    const parsed = Bowser.parse(user_agent)
    const type = parsed.platform.type
    return {
        device:
            type === "mobile" || type === "tablet" || type === "desktop"
                ? type
                : null,
        browser: parsed.browser.name ?? null,
        os: parsed.os.name ?? null
    }
}
