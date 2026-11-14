import { describe, expect, it } from "vitest"
import { afterLooking, IDLE_FOR } from "../idle"

// What the idle watch decides after each look (idle.ts). The watch itself,
// which runs beside the server, was tried by hand against a real one: this
// checkout's is shared by every test, so it's never idle.

const MINUTE = 60 * 1000
const now = Date.parse("2026-11-04T12:00:00Z")

describe("afterLooking", () => {
    it("has no idle clock while anything is connected", () => {
        expect(afterLooking(3, undefined, now)).toEqual({
            action: "wait",
            idle_since: undefined
        })
    })

    it("starts the clock at the first look with nothing connected", () => {
        expect(afterLooking(0, undefined, now)).toEqual({
            action: "wait",
            idle_since: now
        })
    })

    it("keeps the clock it started while nothing connects", () => {
        const since = now - 10 * MINUTE
        expect(afterLooking(0, since, now)).toEqual({
            action: "wait",
            idle_since: since
        })
    })

    it("stops the server once nothing has been connected for half an hour", () => {
        expect(IDLE_FOR).toBe(30 * MINUTE)
        expect(afterLooking(0, now - IDLE_FOR + 1, now)).toEqual({
            action: "wait",
            idle_since: now - IDLE_FOR + 1
        })
        expect(afterLooking(0, now - IDLE_FOR, now)).toEqual({
            action: "stop"
        })
    })

    it("starts over when something connects before then", () => {
        expect(afterLooking(1, now - 29 * MINUTE, now)).toEqual({
            action: "wait",
            idle_since: undefined
        })
    })

    it("takes the idle time it's given", () => {
        expect(afterLooking(0, now - 5000, now, 5000)).toEqual({
            action: "stop"
        })
    })
})
