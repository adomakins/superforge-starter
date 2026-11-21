import { expect, test } from "vitest"
import { describeBrowser } from "../browsers"

// What a User-Agent says: a bot, or what a visitor is on

test("says what a visitor is on, by their browser's User-Agent", () => {
    expect(
        describeBrowser(
            "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1"
        )
    ).toEqual({ device: "mobile", browser: "Safari", os: "iOS" })
    expect(
        describeBrowser(
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36"
        )
    ).toEqual({ device: "desktop", browser: "Chrome", os: "macOS" })
    expect(
        describeBrowser(
            "Mozilla/5.0 (iPad; CPU OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1"
        )
    ).toEqual({ device: "tablet", browser: "Safari", os: "iOS" })
})

test("a bot's, and none at all, is no visitor's", () => {
    for (const user_agent of [
        "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
        "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)",
        "curl/8.7.1",
        "",
        "   "
    ]) {
        expect(describeBrowser(user_agent)).toBeNull()
    }
})
