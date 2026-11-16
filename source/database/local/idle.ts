import { spawn } from "node:child_process"
import { closeSync, openSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { setTimeout as sleep } from "node:timers/promises"
import { fileURLToPath } from "node:url"
import pg from "pg"
import { z } from "zod"

/**
 * This checkout's Postgres stops itself once nothing has been connected to
 * it for half an hour, so a server nobody is using doesn't run on until
 * someone remembers to stop it. A Mac runs at most 32 at once
 * (workbench/writing-code.md, "Local development"), and idle checkouts'
 * servers fill that faster than anyone notices.
 *
 * Whatever starts the server (server.ts) gives it a watch, unless it has
 * one: a process of its own, in the background like the server, which
 * holds one connection, counts the others every minute, and stops the
 * server once there have been none for `IDLE_FOR`. The next `pnpm dev`,
 * test run or `database:*` script starts it again, with its data, in about
 * a second. A dev server holds a connection for as long as it runs
 * (hold.ts), so it counts as using it before its first request.
 *
 * Node runs this file from source, as it does server.ts, so it imports only
 * packages and files beside it, named with their extension.
 */

/** How long the server runs with nothing connected before it stops itself */
export const IDLE_FOR = 30 * 60 * 1000

// How often the watch counts what's connected
const LOOK_EVERY = 60 * 1000

// What the watch's connection is called (`application_name`), which tells a
// server that has a watch from one that hasn't, and keeps a watch from
// counting itself, or another that lost the race to start
const WATCH_NAME = "app idle watch"

// The advisory lock a watch holds while it runs, so a server has only one,
// in the two-key form. It's taken on the `postgres` database, where the app
// takes none.
const WATCH_LOCK: [number, number] = [1530, 0]

// The connections a look counts: every client's but the watches'
const CONNECTED = `select count(*)::int as connected
    from pg_stat_activity
    where backend_type = 'client backend'
        and application_name is distinct from $1`

const taken_row = z.object({ taken: z.boolean() })
const directory_row = z.object({ data_directory: z.string() })
const connected_row = z.object({ connected: z.number() })

// What a running server writes to its data folder's postmaster.pid: its
// process on the first line, its data folder on the second, and its port on
// the fourth (server.ts reads the port the same way)
const postmaster_file = z.object({
    pid: z.coerce.number().int().positive(),
    data: z.string().min(1),
    port: z.coerce.number().int().positive()
})

/** What the watch does after a look */
export const after_looking = z.discriminatedUnion("action", [
    // Looks again, knowing since when nothing has been connected, if it
    // hasn't been since the last look
    z.object({ action: z.literal("wait"), idle_since: z.number().optional() }),
    z.object({ action: z.literal("stop") })
])
export type AfterLooking = z.infer<typeof after_looking>

/**
 * Decides, from how many connections a look found, since when there had
 * been none (undefined if there were some at the last look) and the time,
 * whether the server has been idle for `idle_for`.
 */
export function afterLooking(
    connected: number,
    idle_since: number | undefined,
    now: number,
    idle_for = IDLE_FOR
): AfterLooking {
    if (connected > 0) {
        return { action: "wait", idle_since: undefined }
    } else {
        const since = idle_since ?? now
        if (now - since >= idle_for) {
            return { action: "stop" }
        } else {
            return { action: "wait", idle_since: since }
        }
    }
}

/**
 * Gives this checkout's running Postgres its watch, unless it has one.
 * `url` is the server's `postgres` database, `data` its data folder, and
 * `log` the file the watch writes to: the server's own log.
 */
export async function startIdleWatch(url: string, data: string, log: string) {
    if (await isWatched(url)) {
        return
    }
    // Its output goes to a file, not to whatever started it, so nothing
    // waits on it, as nothing waits on the server
    const output = openSync(log, "a")
    try {
        const watcher = spawn(
            process.execPath,
            [
                "--disable-warning=ExperimentalWarning",
                fileURLToPath(import.meta.url),
                data
            ],
            { detached: true, stdio: ["ignore", output, output] }
        )
        watcher.on("error", (error) => {
            console.error("This checkout's Postgres has no idle watch", {
                error
            })
        })
        watcher.unref()
    } finally {
        closeSync(output)
    }
}

// Whether the server has a watch: a connection with the watch's name
async function isWatched(url: string) {
    const client = new pg.Client({ connectionString: url })
    await client.connect()
    try {
        const { rowCount } = await client.query(
            "select 1 from pg_stat_activity where application_name = $1",
            [WATCH_NAME]
        )
        return (rowCount ?? 0) > 0
    } finally {
        await client.end()
    }
}

/** How long the watch waits between looks, and for nothing connected. */
const watch_timing = z.object({ idle_for: z.number(), look_every: z.number() })
type WatchTiming = z.infer<typeof watch_timing>

/**
 * The watch: holds a connection to the server whose data folder is `data`,
 * and stops the server once nothing else has been connected for `idle_for`.
 * It ends as the server stops, however it stops, and at once if the server
 * already has a watch.
 */
export async function watch(
    data: string,
    timing: WatchTiming = { idle_for: IDLE_FOR, look_every: LOOK_EVERY }
) {
    const server = readPostmaster(data)
    const client = new pg.Client({
        host: "127.0.0.1",
        port: server.port,
        user: "postgres",
        database: "postgres",
        application_name: WATCH_NAME
    })
    // The server ends every connection as it stops, which ends the watch
    client.on("error", (error) => {
        console.info("This checkout's Postgres has stopped, so its watch has", {
            error: error.message
        })
        process.exit(0)
    })
    await client.connect()

    // Only one watch a server, and only on this checkout's: the port in its
    // postmaster.pid could have gone to another server since
    const { taken } = taken_row.parse(
        (
            await client.query(
                "select pg_try_advisory_lock($1, $2) as taken",
                WATCH_LOCK
            )
        ).rows[0]
    )
    const { data_directory } = directory_row.parse(
        (
            await client.query(
                "select current_setting('data_directory') as data_directory"
            )
        ).rows[0]
    )
    if (!taken) {
        // Another watch has it
        await client.end()
    } else if (data_directory !== server.data) {
        console.error("The server on this checkout's port isn't its Postgres", {
            port: server.port,
            data: server.data,
            data_directory
        })
        await client.end()
    } else {
        console.info("This checkout's Postgres has an idle watch", {
            pid: process.pid,
            minutes: timing.idle_for / 60_000
        })
        await lookUntilIdle(client, server.pid, timing)
    }
}

// Counts what's connected every `look_every`, and stops the server once
// nothing has been for `idle_for`
async function lookUntilIdle(
    client: pg.Client,
    pid: number,
    timing: WatchTiming
) {
    let idle_since: number | undefined
    for (;;) {
        await sleep(timing.look_every)
        const { rows } = await client.query(CONNECTED, [WATCH_NAME])
        const { connected } = connected_row.parse(rows[0])
        const next = afterLooking(
            connected,
            idle_since,
            Date.now(),
            timing.idle_for
        )
        if (next.action === "stop") {
            console.info(
                "Stopping this checkout's Postgres, which has had nothing connected",
                { minutes: timing.idle_for / 60_000, pid }
            )
            // The signal `pg_ctl stop --mode=fast` sends, which needs nothing
            // of the checkout's, so it stops a server whose checkout was
            // deleted under it too
            process.kill(pid, "SIGINT")
            return
        } else {
            idle_since = next.idle_since
        }
    }
}

function readPostmaster(data: string) {
    const lines = readFileSync(join(data, "postmaster.pid"), "utf8").split("\n")
    return postmaster_file.parse({
        pid: lines[0],
        data: lines[1],
        port: lines[3]
    })
}

// Run as a script, by startIdleWatch: the watch itself
if (fileURLToPath(import.meta.url) === process.argv[1]) {
    const [data] = process.argv.slice(2)
    if (data === undefined) {
        console.error("Usage: node source/database/local/idle.ts <data folder>")
        process.exit(1)
    }
    await watch(data).then(
        () => process.exit(0),
        (error: unknown) => {
            console.error("This checkout's Postgres's idle watch failed", {
                error
            })
            process.exit(1)
        }
    )
}
