import type { Database } from "@/database"
import type { Storage } from "@/database/storage"
import type { Workflows } from "./define"

/** What a runner's turn is handed: the process's database, bucket and workflows. */
export type RunnerContext = {
    database: Database
    storage: Storage
    workflows: Workflows
}

/**
 * Something that runs every `every` milliseconds while this process runs
 * the workflows, behind the gate, so one process at a time does: what's
 * just due at a time, kept as a timestamp in Postgres that a runner checks
 * (README.md, "Runners"), like a reminder, or a run started for each row
 * that's due. A feature defines its own in its folder and lists it in
 * index.ts's RUNNERS.
 */
export type Runner = {
    name: string
    every: number
    run: (context: RunnerContext) => Promise<void>
}

/**
 * Starts each runner on its timer. A turn never overlaps the one before,
 * and one that throws is logged and the runner goes on. Answers what stops
 * them all, which a stop calls before DBOS shuts down.
 */
export function startRunners(runners: Runner[], context: RunnerContext) {
    const timers = runners.map((runner) => {
        let running = false
        return setInterval(() => {
            if (running) {
                return
            }
            running = true
            runner
                .run(context)
                .catch((error: unknown) => {
                    console.error("A runner's turn failed", {
                        runner: runner.name,
                        error
                    })
                })
                .finally(() => {
                    running = false
                })
        }, runner.every)
    })
    return () => {
        for (const timer of timers) {
            clearInterval(timer)
        }
    }
}
