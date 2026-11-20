import { afterEach, beforeEach, expect, test, vi } from "vitest"
import { connect } from "@/database"
import { Storage } from "@/database/storage"
import { memoryStore } from "@/database/tests/support/storage"
import { type RunnerContext, startRunners } from "../runners"
import { recordedWorkflows } from "./support/recorded"

// The runners on their timers: a turn each time, never two at once, one
// that throws logged and the runner going on, and nothing after the stop

beforeEach(() => {
    vi.useFakeTimers()
})

afterEach(() => {
    vi.useRealTimers()
})

// What a turn is handed, which these runners don't touch
const context: RunnerContext = {
    database: connect("postgres://unused@127.0.0.1:1/unused", 1),
    storage: new Storage(memoryStore().store),
    workflows: recordedWorkflows().workflows
}

test("a runner's turns come on its timer, never two at once, and stop with it", async () => {
    let turns = 0
    let finish = () => {}
    const stop = startRunners(
        [
            {
                name: "slow",
                every: 1000,
                run: () => {
                    turns += 1
                    return new Promise<void>((resolve) => {
                        finish = resolve
                    })
                }
            }
        ],
        context
    )

    await vi.advanceTimersByTimeAsync(3500)
    expect(turns).toBe(1)
    finish()
    await vi.advanceTimersByTimeAsync(1000)
    expect(turns).toBe(2)

    stop()
    finish()
    await vi.advanceTimersByTimeAsync(5000)
    expect(turns).toBe(2)
})

test("a turn that throws is logged, and the runner goes on", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {})
    let turns = 0
    const stop = startRunners(
        [
            {
                name: "breaks",
                every: 1000,
                run: async () => {
                    turns += 1
                    throw new Error("No luck")
                }
            }
        ],
        context
    )
    await vi.advanceTimersByTimeAsync(3000)
    stop()
    expect(turns).toBe(3)
    expect(logged).toHaveBeenCalledWith("A runner's turn failed", {
        runner: "breaks",
        error: new Error("No luck")
    })
})
