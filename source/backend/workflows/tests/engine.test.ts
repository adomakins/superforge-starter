import { randomUUID } from "node:crypto"
import { setTimeout as sleep } from "node:timers/promises"
import { DBOS } from "@dbos-inc/dbos-sdk"
import type pg from "pg"
import {
    afterAll,
    beforeAll,
    beforeEach,
    describe,
    expect,
    inject,
    test,
    vi
} from "vitest"
import { z } from "zod"
import { connect } from "@/database"
import { Storage } from "@/database/storage"
import { databaseUrl, onServer, quoted } from "@/database/tests/support/server"
import { memoryStore } from "@/database/tests/support/storage"
import { HOUR } from "@/utilities/primitives/durations"
import { defineWorkflow } from "../define"
import {
    dbosWorkflows,
    pruneFinishedRuns,
    startWorkflows,
    stopWorkflows,
    takeGate
} from "../engine"
import type { WorkflowDependencies } from "../process"

// The workflows on DBOS itself, in real time, on a database of their own:
// the gate, a run started before DBOS has launched, a run that carries on
// after a restart, and pruning. DBOS is one per process, so these run one
// after another, on one database, each going on from the one before.

const name = `app_test_${randomUUID().replaceAll("-", "")}`
const url = databaseUrl(name)
const database = connect(url, 2)

// How many times each run's steps have run, by the run's name
const ran = new Map<string, { first: number; second: number }>()
// Runs whose second step never returns the first time it runs, the way a
// process that stops mid-step leaves it
const stuck = new Set<string>()

const twoSteps = defineWorkflow({
    name: "two-steps",
    input: z.object({ run: z.string() }),
    run: async ({ run }, context) => {
        const counts = ran.get(run) ?? { first: 0, second: 0 }
        ran.set(run, counts)
        const first = await context.step("first", async () => {
            counts.first += 1
            return `first of ${run}`
        })
        const second = await context.step("second", async () => {
            counts.second += 1
            if (stuck.has(run) && counts.second === 1) {
                await new Promise(() => {})
            }
            return `second of ${run}`
        })
        return [first, second]
    }
})

const dependencies: WorkflowDependencies = {
    database,
    storage: new Storage(memoryStore().store),
    database_url: url,
    workflows: [twoSteps],
    // This machine's Postgres is every checkout's
    dbos_pool_size: 4
}

// A run's status as DBOS's own table has it, for while DBOS isn't running
async function storedStatus(id: string) {
    const { rows } = await database.$client.query<{ status: string }>(
        "select status from dbos.workflow_status where workflow_uuid = $1",
        [id]
    )
    return rows[0]?.status
}

beforeAll(async () => {
    // A copy of the run's template, which every migration, DBOS's among
    // them, was applied to
    await onServer((client) =>
        client.query(
            `create database ${quoted(name)} template ${quoted(inject("database_template"))}`
        )
    )
})

beforeEach(() => {
    vi.spyOn(console, "info").mockImplementation(() => {})
})

afterAll(async () => {
    await stopWorkflows()
    await database.$client.end()
    await onServer((client) =>
        client.query(`drop database ${quoted(name)} with (force)`)
    )
})

describe("the workflows on DBOS", { timeout: 60_000 }, () => {
    test("wait at the gate, take a run on its queue meanwhile, then run it", async () => {
        // The deployment before this one, holding the gate
        let before: pg.Client | undefined
        await takeGate(url, (gate) => {
            before = gate
        })
        const starting = startWorkflows(dependencies)
        await sleep(500)
        expect(DBOS.isInitialized()).toBe(false)

        // Starting one meanwhile puts it on its queue through a client, and
        // starting it twice under its id is harmless
        const id = await dbosWorkflows.start(twoSteps, { run: "queued" })
        await dbosWorkflows.start(twoSteps, { run: "queued" }, { id })

        // The deployment before exits, which lets this one launch
        await before?.end()
        await starting
        expect(DBOS.isInitialized()).toBe(true)

        expect(await DBOS.retrieveWorkflow(id).getResult()).toEqual([
            "first of queued",
            "second of queued"
        ])
        expect(ran.get("queued")).toEqual({ first: 1, second: 1 })
    })

    test("carry a run cut off mid-step on after a restart, without its finished steps again", async () => {
        stuck.add("restarted")
        const id = await dbosWorkflows.start(twoSteps, { run: "restarted" })
        await vi.waitFor(() => expect(ran.get("restarted")?.second).toBe(1), {
            timeout: 10_000,
            interval: 100
        })

        // The process stops mid-step, as Railway stops the old deployment,
        // and the run is left where it was
        await stopWorkflows()
        expect(DBOS.isInitialized()).toBe(false)
        expect(await storedStatus(id)).toBe("PENDING")

        // The next process takes the gate and launches, and carries it on
        // from the step it was in
        await startWorkflows(dependencies)
        expect(await DBOS.retrieveWorkflow(id).getResult()).toEqual([
            "first of restarted",
            "second of restarted"
        ])
        expect(ran.get("restarted")).toEqual({ first: 1, second: 2 })
    })

    test("prune finished runs, steps and all", async () => {
        const finished = await DBOS.listWorkflows({})
        expect(finished.length).toBeGreaterThan(0)

        // Nothing finished an hour ago, and everything has by a moment from
        // now
        expect(await pruneFinishedRuns(Date.now() - HOUR)).toBe(0)
        expect(await pruneFinishedRuns(Date.now() + 1000)).toBe(finished.length)

        expect(await DBOS.listWorkflows({})).toEqual([])
        const { rows } = await database.$client.query<{ steps: number }>(
            "select count(*)::int as steps from dbos.operation_outputs"
        )
        expect(rows[0]?.steps).toBe(0)
    })
})
