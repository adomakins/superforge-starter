import { inArray, lt } from "drizzle-orm"
import type { Database } from "@/database"
import { analytics_events, analytics_visits } from "@/database/schema"
import { fromNow } from "@/database/time"
import { DAY, HOUR } from "@/utilities/primitives/durations"
import type { Runner } from "../workflows/runners"

// How long the site's analytics is kept, and the runner that deletes what's
// older. The events are the bulk of it, and say the most about one
// visitor, so they go first; a visit, a row with what its events came to,
// stays for the reports that look back a year or two.

/**
 * How long an event is kept after it happened, or `"forever"`. Every
 * report over events reads this far back at most.
 */
export const KEEP_EVENTS_FOR: number | "forever" = 90 * DAY

/**
 * How long a visit is kept after it started, or `"forever"`: 25 months,
 * enough to set a month beside the same one two years before, and the
 * longest France's regulator (CNIL) says to keep what a site measures of
 * its audience.
 */
export const KEEP_VISITS_FOR: number | "forever" = 760 * DAY

// How many rows one statement deletes, and how many statements a turn runs
// at most, so a turn is short and holds no lock for long: what's left
// goes on the next turn
const BATCH = 5000
const BATCHES_A_TURN = 20

/** Deletes up to `limit` events that happened before `keep` ago, and answers how many. */
export async function deleteOldEvents(
    database: Database,
    { keep, limit }: { keep: number; limit: number }
) {
    const old = database
        .select({ id: analytics_events.id })
        .from(analytics_events)
        .where(lt(analytics_events.occurred_at, fromNow(-keep)))
        .limit(limit)
    const deleted = await database
        .delete(analytics_events)
        .where(inArray(analytics_events.id, old))
        .returning({ id: analytics_events.id })
    return deleted.length
}

/**
 * Deletes up to `limit` visits that started before `keep` ago, with any
 * events they still have, and answers how many visits.
 */
export async function deleteOldVisits(
    database: Database,
    { keep, limit }: { keep: number; limit: number }
) {
    const old = database
        .select({ id: analytics_visits.id })
        .from(analytics_visits)
        .where(lt(analytics_visits.started_at, fromNow(-keep)))
        .limit(limit)
    const deleted = await database
        .delete(analytics_visits)
        .where(inArray(analytics_visits.id, old))
        .returning({ id: analytics_visits.id })
    return deleted.length
}

/**
 * Deletes the events and the visits older than they're kept, a batch at a
 * time, and answers how many of each: by `KEEP_EVENTS_FOR` and
 * `KEEP_VISITS_FOR`, or a test's own.
 */
export async function pruneAnalytics(
    database: Database,
    {
        events = KEEP_EVENTS_FOR,
        visits = KEEP_VISITS_FOR
    }: { events?: number | "forever"; visits?: number | "forever" } = {}
) {
    return {
        events:
            events === "forever"
                ? 0
                : await inBatches((limit) =>
                      deleteOldEvents(database, { keep: events, limit })
                  ),
        visits:
            visits === "forever"
                ? 0
                : await inBatches((limit) =>
                      deleteOldVisits(database, { keep: visits, limit })
                  )
    }
}

// Runs `deleteBatch` until a batch comes back short, or the turn has run
// its share, and answers how many rows went
async function inBatches(deleteBatch: (limit: number) => Promise<number>) {
    let deleted = 0
    for (let batch = 0; batch < BATCHES_A_TURN; batch++) {
        const last = await deleteBatch(BATCH)
        deleted += last
        if (last < BATCH) {
            break
        }
    }
    return deleted
}

/**
 * Each hour, deletes the analytics older than it's kept
 * (backend/workflows/README.md, "Runners").
 */
export const pruneAnalyticsRunner: Runner = {
    name: "prune-analytics",
    every: HOUR,
    run: async ({ database }) => {
        const deleted = await pruneAnalytics(database)
        if (deleted.events > 0 || deleted.visits > 0) {
            console.info("Old analytics deleted", deleted)
        }
    }
}
