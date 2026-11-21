import { expect, test } from "vitest"
import { analytics_events, analytics_visits } from "@/database/schema"
import { testDatabase } from "@/database/tests/support/database"
import { DAY } from "@/utilities/primitives/durations"
import {
    deleteOldEvents,
    KEEP_EVENTS_FOR,
    KEEP_VISITS_FOR,
    pruneAnalytics
} from "../prune"

// How long the analytics is kept: the events for a while, the visits for
// longer, and either for good when a copy says so

// A visit that started `days` ago, with one event then, and a server's
// event of the same age
async function visitFrom(
    database: Awaited<ReturnType<typeof testDatabase>>,
    days: number
) {
    const at = new Date(Date.now() - days * DAY)
    const [visit] = await database
        .insert(analytics_visits)
        .values({
            visitor_id: `visitor-${days}`,
            anonymous: false,
            started_at: at,
            ended_at: at
        })
        .returning()
    await database.insert(analytics_events).values([
        {
            source: "browser",
            name: "view",
            visit_id: visit?.id,
            visitor_id: `visitor-${days}`,
            path: "/",
            occurred_at: at
        },
        { source: "server", name: "signed-up", occurred_at: at }
    ])
}

// How many days old each visit is, and each event, oldest first
async function ages(database: Awaited<ReturnType<typeof testDatabase>>) {
    const days = (at: Date) => Math.round((Date.now() - at.getTime()) / DAY)
    const visits = await database.select().from(analytics_visits)
    const events = await database.select().from(analytics_events)
    return {
        visits: visits.map((visit) => days(visit.started_at)).sort(descending),
        events: events.map((event) => days(event.occurred_at)).sort(descending)
    }
}

function descending(one: number, other: number) {
    return other - one
}

test("events go after 90 days and visits after 25 months, as the template ships", () => {
    expect(KEEP_EVENTS_FOR).toBe(90 * DAY)
    expect(KEEP_VISITS_FOR).toBe(760 * DAY)
})

test("deletes the events older than they're kept, and leaves their visits", async () => {
    const database = await testDatabase()
    for (const days of [1, 89, 91, 400]) {
        await visitFrom(database, days)
    }

    expect(await pruneAnalytics(database)).toEqual({ events: 4, visits: 0 })
    expect(await ages(database)).toEqual({
        visits: [400, 91, 89, 1],
        events: [89, 89, 1, 1]
    })
    // Nothing left to delete
    expect(await pruneAnalytics(database)).toEqual({ events: 0, visits: 0 })
})

test("deletes the visits older than they're kept, with any events they still have", async () => {
    const database = await testDatabase()
    for (const days of [1, 759, 761]) {
        await visitFrom(database, days)
    }

    // The events kept for good: the old visit takes its own with it, and
    // the server's of that age stays
    expect(await pruneAnalytics(database, { events: "forever" })).toEqual({
        events: 0,
        visits: 1
    })
    expect(await ages(database)).toEqual({
        visits: [759, 1],
        events: [761, 759, 759, 1, 1]
    })
})

test("keeps for good what a copy says to", async () => {
    const database = await testDatabase()
    await visitFrom(database, 5000)
    expect(
        await pruneAnalytics(database, { events: "forever", visits: "forever" })
    ).toEqual({ events: 0, visits: 0 })
    expect((await ages(database)).visits).toEqual([5000])
})

test("deletes a batch at a time, the oldest left for the next", async () => {
    const database = await testDatabase()
    for (const days of [100, 200, 300]) {
        await visitFrom(database, days)
    }
    expect(await deleteOldEvents(database, { keep: 90 * DAY, limit: 4 })).toBe(
        4
    )
    expect(await deleteOldEvents(database, { keep: 90 * DAY, limit: 4 })).toBe(
        2
    )
    expect(await deleteOldEvents(database, { keep: 90 * DAY, limit: 4 })).toBe(
        0
    )
})
