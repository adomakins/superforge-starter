import { createFileRoute } from "@tanstack/react-router"
import { cn } from "cn"
import { RotateCw } from "lucide-react"
import { type ReactNode, useEffect, useState } from "react"
import {
    BusinessMark,
    EnvironmentChip,
    useAddress
} from "@/frontend/components/mockups/environment"
import { Footer } from "@/frontend/components/mockups/footer"
import { type Health, useHealth } from "@/frontend/components/mockups/health"
import { PLANNED_PARTS } from "@/frontend/components/mockups/planned"
import { PromptChip } from "@/frontend/components/mockups/say-to-claude"
import {
    apiStatus,
    databaseStatus,
    type Recovery,
    RecoveryNote,
    recoveryFor,
    type Status,
    StatusLine,
    storageStatus,
    type Tone,
    websiteStatus
} from "@/frontend/components/mockups/status"
import { Button } from "@/frontend/components/primitives/button"

export const Route = createFileRoute("/mockups/line")({
    component: LineMap
})

// Direction C: the app as a transit line, a station for each part, which the
// health check runs down from the browser to the database each time it's
// asked; the parts still to come are stations under construction

// How long the pulse takes over each stretch of line it runs. The check
// itself often answers in a few milliseconds; the stations wait for the
// pulse to arrive before they show what it found, so it can be seen.
const STRETCH_MS = 220
const STRETCHES_TO_THE_DATABASE = 4

const TRAVEL = `
@keyframes travel {
    0% { top: 0; opacity: 1; }
    99% { top: 100%; opacity: 1; }
    100% { top: 100%; opacity: 0; }
}
`

// The pulse runs each time a check starts, and has arrived once it's had
// time to reach the database. Nothing runs for anyone who asks for less
// motion: what the check found shows as soon as it answers.
function usePulse(checking: boolean) {
    const [run, setRun] = useState(0)
    const [arrived, setArrived] = useState(false)

    useEffect(() => {
        if (checking) {
            setRun((previous) => previous + 1)
        }
    }, [checking])

    useEffect(() => {
        if (run === 0) {
            return
        }
        const still = window.matchMedia(
            "(prefers-reduced-motion: reduce)"
        ).matches
        setArrived(false)
        const timer = setTimeout(
            () => setArrived(true),
            still ? 0 : STRETCH_MS * STRETCHES_TO_THE_DATABASE
        )
        return () => clearTimeout(timer)
    }, [run])

    return { run, arrived }
}

type Station = {
    name: string
    kind?: string
    what: string
    path?: string
    status?: Status
    shape: "origin" | "stop" | "branch" | "planned"
    // Which part this is, when a failed check can be about it
    checks?: Recovery["part"]
}

const PLANNED: Station[] = PLANNED_PARTS.map((part) => ({
    name: part.name,
    kind: part.kind ?? undefined,
    what: part.what,
    shape: "planned"
}))

// Where the API's stop is on the line, the first the check can find broken
const API_POSITION = 2

function LineMap() {
    const { health, checking, checkAgain } = useHealth()
    const { run, arrived } = usePulse(checking)
    const address = useAddress()

    // Until the pulse reaches the database, the stations it checks are
    // still being checked
    const seen: Health = arrived ? health : { state: "checking" }
    const recovery = recoveryFor(seen)

    const live: Station[] = [
        {
            name: "You",
            what:
                address === null
                    ? "Your browser"
                    : `Your browser, at ${address}`,
            shape: "origin"
        },
        {
            name: "Website",
            kind: "TanStack Start",
            what: "The pages, each one built ahead of time. This one is routes/index.tsx.",
            path: "source/frontend/",
            status: websiteStatus(),
            shape: "stop"
        },
        {
            name: "API",
            kind: "Hono, under /api",
            what: "Everything the site reads and writes goes through it.",
            path: "source/backend/",
            status: apiStatus(seen),
            shape: "stop",
            checks: "api"
        },
        {
            name: "Storage",
            kind: "a bucket",
            what: "Files: uploads, images, exports.",
            path: "source/database/storage/",
            status: storageStatus(),
            shape: "branch"
        },
        {
            name: "Database",
            kind: "Postgres",
            what: "What the business keeps: customers, orders, bookings.",
            path: "source/database/schema.ts",
            status: databaseStatus(seen),
            shape: "stop",
            checks: "database"
        }
    ]

    return (
        <main className="mx-auto flex max-w-5xl flex-col gap-12 px-5 py-6 sm:px-8 sm:py-10">
            <style>{TRAVEL}</style>
            <header className="flex items-center justify-between gap-4">
                <BusinessMark />
                <EnvironmentChip />
            </header>

            <section className="flex max-w-2xl flex-col gap-3">
                <h1 className="text-balance font-heading font-semibold text-3xl tracking-tight sm:text-4xl">
                    One codebase, from the page to the database.
                </h1>
                <p className="max-w-[58ch] text-pretty text-muted-foreground leading-relaxed">
                    When this page opened, it asked your API whether the
                    database was up. This is the line that question ran along,
                    and the stops still being built.
                </p>
                <p className="mt-2 flex flex-wrap items-center gap-2 text-sm lg:hidden">
                    New here? Say
                    <PromptChip prompt="start here" />
                    to Claude.
                </p>
            </section>

            <div className="grid gap-x-16 gap-y-12 lg:grid-cols-[minmax(0,1fr)_19rem]">
                <section
                    aria-labelledby="line"
                    className="@container flex flex-col gap-6"
                >
                    <div className="flex items-center justify-between gap-4">
                        <h2
                            id="line"
                            className="font-heading font-semibold text-lg tracking-tight"
                        >
                            The line
                        </h2>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={checkAgain}
                            disabled={checking || !arrived}
                            className="-mr-2 text-muted-foreground"
                        >
                            <RotateCw aria-hidden />
                            Run it again
                        </Button>
                    </div>

                    <ol>
                        {live.map((station, index) => (
                            <StationRow
                                key={station.name}
                                station={station}
                                recovery={
                                    recovery !== null &&
                                    recovery.part === station.checks
                                        ? recovery
                                        : null
                                }
                                stretch={
                                    <Stretch
                                        index={index}
                                        run={run}
                                        live={index < STRETCHES_TO_THE_DATABASE}
                                        planned={
                                            index >= STRETCHES_TO_THE_DATABASE
                                        }
                                        broken={index >= brokenFrom(seen)}
                                    />
                                }
                            />
                        ))}
                        <li className="relative grid grid-cols-[2rem_minmax(0,1fr)] gap-x-4 pb-6">
                            <Stretch index={-1} run={run} planned />
                            <p className="col-start-2 font-medium text-muted-foreground text-xs">
                                Coming to Foundation
                            </p>
                        </li>
                        {PLANNED.map((station, index) => (
                            <StationRow
                                key={station.name}
                                station={station}
                                stretch={
                                    index < PLANNED.length - 1 ? (
                                        <Stretch index={-1} run={run} planned />
                                    ) : null
                                }
                            />
                        ))}
                    </ol>
                </section>

                <NextStops />
            </div>

            <Footer />
        </main>
    )
}

// Where the check stopped, as the first stretch of line it couldn't run: the
// whole run from the API to the database when the API couldn't reach it
// (the branch to Storage stays as it is), everything past the website when
// the API didn't answer, and none when it all answered
function brokenFrom(health: Health): number {
    switch (health.state) {
        case "database-down":
            return API_POSITION
        case "unreachable":
            return API_POSITION - 1
        case "checking":
        case "up":
            return Number.POSITIVE_INFINITY
    }
}

// The line from this station's dot to the next one's, solid where it's
// built, dashed where it isn't and red where the check couldn't get
// through, with the pulse running down it when a check starts. A branch's
// row carries the main line straight past it.
function Stretch({
    index,
    run,
    live = false,
    planned = false,
    broken = false
}: {
    index: number
    run: number
    live?: boolean
    planned?: boolean
    broken?: boolean
}) {
    let track: string
    if (planned) {
        track = "border-muted-foreground/40 border-l-4 border-dashed"
    } else if (broken) {
        track = "bg-destructive"
    } else {
        track = "bg-primary"
    }
    return (
        <span
            aria-hidden
            className={cn(
                "absolute top-3 -bottom-3 left-[calc(1rem-2px)] w-1 transition-colors duration-200",
                track
            )}
        >
            {live && run > 0 && (
                <span
                    key={run}
                    className="absolute inset-x-0 h-6 -translate-y-1/2 rounded-full bg-background/85 opacity-0 motion-reduce:hidden"
                    style={{
                        animation: `travel ${STRETCH_MS}ms linear ${index * STRETCH_MS}ms forwards`
                    }}
                />
            )}
        </span>
    )
}

// One stop: its dot on the line, its name and what it's made with, what it
// found, and what it's for. Its status sits beside its name when there's
// room for both, and under it when there isn't. The stop a failed check was
// about says how to fix it, right under it.
function StationRow({
    station,
    stretch,
    recovery = null
}: {
    station: Station
    stretch: ReactNode
    recovery?: Recovery | null
}) {
    const branch = station.shape === "branch"
    return (
        <li
            className={cn(
                "relative grid gap-x-4",
                branch
                    ? "grid-cols-[2rem_1rem_minmax(0,1fr)] pb-7"
                    : "grid-cols-[2rem_minmax(0,1fr)] pb-8"
            )}
        >
            {stretch}
            <StationDot shape={station.shape} tone={station.status?.tone} />
            {branch && (
                <span
                    aria-hidden
                    className="absolute top-[calc(0.75rem-2px)] left-4 h-1 w-[2.25rem] bg-primary/45"
                />
            )}
            <div
                className={cn(
                    "flex min-w-0 flex-col gap-1",
                    branch ? "col-start-3" : "col-start-2"
                )}
            >
                <div className="flex flex-col gap-1 @lg:flex-row @lg:flex-wrap @lg:items-baseline @lg:justify-between @lg:gap-x-6">
                    <h3
                        className={cn(
                            "font-heading font-semibold tracking-tight",
                            branch ? "text-sm leading-6" : "text-base",
                            station.shape === "planned" &&
                                "text-muted-foreground"
                        )}
                    >
                        {station.name}
                        {station.kind !== undefined && (
                            <span className="ml-2 font-normal font-sans text-muted-foreground text-sm tracking-normal">
                                {station.kind}
                            </span>
                        )}
                    </h3>
                    {station.status !== undefined && (
                        <StatusLine status={station.status} />
                    )}
                </div>
                <p className="text-pretty text-muted-foreground text-sm">
                    {station.what}
                </p>
                {station.path !== undefined && (
                    <code className="font-mono text-foreground/70 text-xs">
                        {station.path}
                    </code>
                )}
                {recovery !== null && (
                    <RecoveryNote recovery={recovery} className="mt-3" />
                )}
            </div>
        </li>
    )
}

// A stop is a ring on the line, filled once the check has passed through
// it and red where it couldn't; the origin is a filled dot, a branch a
// smaller ring off the line, and a stop still to come a dashed ring
function StationDot({
    shape,
    tone
}: {
    shape: Station["shape"]
    tone: Tone | undefined
}) {
    let stop: string
    if (tone === "ok") {
        stop = "border-primary bg-primary"
    } else if (tone === "problem") {
        stop = "border-destructive bg-background"
    } else {
        stop = "border-primary bg-background"
    }
    return (
        <span
            aria-hidden
            className={cn(
                "relative z-10 row-start-1 justify-self-center rounded-full transition-colors duration-200",
                shape === "origin" && "col-start-1 mt-1 size-4 bg-primary",
                shape === "stop" &&
                    cn("col-start-1 mt-1 size-4 border-[3px]", stop),
                shape === "branch" &&
                    "col-start-2 mt-1.5 size-3 border-[2.5px] border-primary/60 bg-background",
                shape === "planned" &&
                    "col-start-1 mt-1 size-4 border-[3px] border-muted-foreground/45 border-dashed bg-background"
            )}
        />
    )
}

const STOPS = [
    {
        title: "Make it yours",
        body: "Claude asks about your business, then sets your colors, fonts and words, and replaces this page with yours.",
        prompt: "start here"
    },
    {
        title: "Build what it needs",
        body: "Each new part runs on this line: a table in the database, routes in the API, a page on the website.",
        prompt: "Keep a list of our customers"
    },
    {
        title: "Put it online",
        body: "Railway, set up once from workbench/commit-and-deploy.md. After that, each change you merge goes live once its checks pass.",
        prompt: "Put it online"
    }
] as const

function NextStops() {
    return (
        <aside
            aria-labelledby="next-stops"
            className="flex flex-col gap-5 lg:sticky lg:top-10 lg:self-start"
        >
            <h2
                id="next-stops"
                className="font-heading font-semibold text-lg tracking-tight"
            >
                Next stops
            </h2>
            <ol className="flex flex-col gap-6">
                {STOPS.map((stop, index) => (
                    <li
                        key={stop.title}
                        className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-x-3"
                    >
                        <span
                            aria-hidden
                            className="flex size-7 items-center justify-center rounded-full bg-primary font-semibold text-primary-foreground text-sm tabular-nums"
                        >
                            {index + 1}
                        </span>
                        <div className="flex flex-col gap-2 pt-0.5">
                            <h3 className="font-medium">{stop.title}</h3>
                            <p className="text-pretty text-muted-foreground text-sm">
                                {stop.body}
                            </p>
                            <PromptChip
                                prompt={stop.prompt}
                                className="w-fit"
                            />
                        </div>
                    </li>
                ))}
            </ol>
        </aside>
    )
}
