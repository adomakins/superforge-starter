import { cn } from "cn"
import { useEffect, useState } from "react"
import type { RunDetail, RunSummary } from "@/frontend/queries/workflows"
import { took } from "./words"

// The home page's line, carried into the dashboard: a workflow's run is a
// short line of its steps, each a stop, filled once it's done, a ring while
// the run works on the next, dashed while it waits its turn, and red where
// it failed. Drawn in the theme's main color, as the line is.

type StopState = "done" | "working" | "waiting" | "failed" | "canceled"
type RunStatus = RunSummary["status"]

const STOP: Record<StopState, string> = {
    done: "border-primary bg-primary",
    working: "border-primary bg-background",
    waiting: "border-muted-foreground/45 border-dashed bg-background",
    failed: "border-destructive bg-background",
    canceled: "border-muted-foreground/60 bg-muted-foreground/30"
}

/** One stop: a step's, or a whole run's. */
export function Stop({
    state,
    size = "small",
    className
}: {
    state: StopState
    size?: "small" | "large"
    className?: string
}) {
    return (
        <span
            aria-hidden
            className={cn(
                "relative inline-block shrink-0 rounded-full transition-colors duration-200",
                size === "small"
                    ? "size-3 border-[2.5px]"
                    : "size-4 border-[3px]",
                STOP[state],
                className
            )}
        >
            {state === "working" && (
                <span className="absolute -inset-[3px] animate-ping rounded-full border-2 border-primary/60 motion-reduce:hidden" />
            )}
        </span>
    )
}

/** A run's status as a stop. */
export function runStop(status: RunStatus): StopState {
    switch (status) {
        case "succeeded":
            return "done"
        case "running":
            return "working"
        case "queued":
            return "waiting"
        case "failed":
            return "failed"
        case "canceled":
            return "canceled"
    }
}

/** What a run's status is called on screen. */
export const RUN_STATUS_NAMES: Record<RunStatus, string> = {
    queued: "Queued",
    running: "Running",
    succeeded: "Done",
    failed: "Failed",
    canceled: "Canceled"
}

/** A run's status in words, beside its stop. */
export function RunStatusMark({
    status,
    className
}: {
    status: RunStatus
    className?: string
}) {
    return (
        <span
            className={cn(
                "inline-flex items-center gap-2 text-sm",
                status === "failed" ? "text-destructive" : "text-foreground",
                className
            )}
        >
            <Stop state={runStop(status)} />
            {RUN_STATUS_NAMES[status]}
        </span>
    )
}

// A run's stops: each step it has finished, then where it is now while it
// isn't done, a ring as it works on the next and a dashed one while it
// waits for its turn
function stopsOf(run: RunDetail) {
    const stops: { key: string; name: string; state: StopState }[] =
        run.steps.map((step) => ({
            key: `step-${step.number}`,
            name: step.name,
            state: step.status === "failed" ? "failed" : "done"
        }))
    if (run.status === "running") {
        stops.push({ key: "now", name: "the next step", state: "working" })
    } else if (run.status === "queued") {
        stops.push({ key: "now", name: "its turn", state: "waiting" })
    }
    return stops
}

/** A run's steps as a short line, for a row. */
export function RunLine({
    run,
    className
}: {
    run: RunDetail
    className?: string
}) {
    const stops = stopsOf(run)
    return (
        <span
            role="img"
            aria-label={`Steps: ${stops.map((stop) => `${stop.name} ${stop.state}`).join(", ")}`}
            className={cn("inline-flex items-center", className)}
        >
            {stops.map((stop, index) => (
                <span key={stop.key} className="inline-flex items-center">
                    {index > 0 && <Connector into={stop.state} />}
                    <Stop state={stop.state} />
                </span>
            ))}
        </span>
    )
}

// The stretch of line into a stop: solid once it's started, dashed while
// it waits, red into a failure
function Connector({ into }: { into: StopState }) {
    if (into === "waiting") {
        return (
            <span
                aria-hidden
                className="w-4 border-muted-foreground/40 border-t-[3px] border-dashed"
            />
        )
    } else {
        return (
            <span
                aria-hidden
                className={cn(
                    "h-[3px] w-4",
                    into === "failed" ? "bg-destructive" : "bg-primary"
                )}
            />
        )
    }
}

/**
 * A run's steps down a line, each with how long it took and what it
 * returned, and what it threw where it failed, then where the run is now
 * while it isn't done.
 */
export function StepRail({ run }: { run: RunDetail }) {
    const rows: RailRow[] = run.steps.map((step) => ({
        key: `step-${step.number}`,
        name: step.name,
        state: step.status === "failed" ? "failed" : "done",
        timing:
            step.started_at !== null && step.completed_at !== null
                ? took(step.started_at, step.completed_at)
                : step.status === "failed"
                  ? "gave up"
                  : "",
        output: step.output,
        error: step.error,
        code: true
    }))
    if (run.status === "running") {
        rows.push(nowRow("working", "Working on the next step"))
    } else if (run.status === "queued") {
        rows.push(nowRow("waiting", "Waiting its turn on the queue"))
    }
    if (rows.length === 0) {
        return (
            <p className="text-pretty text-muted-foreground text-sm">
                {run.status === "succeeded"
                    ? "It finished without a step: everything it did was in its body."
                    : "It stopped before its first step."}
            </p>
        )
    }
    return (
        <ol>
            {rows.map((row, index) => {
                const next = rows[index + 1]
                return (
                    <li
                        key={row.key}
                        className={cn(
                            "relative grid grid-cols-[1.5rem_minmax(0,1fr)] gap-x-3",
                            next !== undefined && "pb-5"
                        )}
                    >
                        {next !== undefined && <Track into={next.state} />}
                        <Stop
                            state={row.state}
                            size="large"
                            className="mt-0.5 justify-self-center"
                        />
                        <div className="flex min-w-0 flex-col gap-1.5">
                            <div className="flex items-baseline justify-between gap-4">
                                <span
                                    className={cn(
                                        "text-sm",
                                        row.code
                                            ? "font-mono"
                                            : "text-muted-foreground"
                                    )}
                                >
                                    {row.name}
                                </span>
                                <span className="shrink-0 text-muted-foreground text-xs tabular-nums">
                                    {row.timing}
                                </span>
                            </div>
                            {row.output !== null && (
                                <code className="w-fit max-w-full truncate font-mono text-muted-foreground text-xs">
                                    {row.output.replace(/\s+/g, " ")}
                                </code>
                            )}
                            {row.error !== null && (
                                <p className="text-pretty rounded-md bg-destructive/10 px-3 py-2 text-destructive text-sm leading-relaxed">
                                    {row.error}
                                </p>
                            )}
                        </div>
                    </li>
                )
            })}
        </ol>
    )
}

// A row of the rail: a step, or where the run is now
type RailRow = {
    key: string
    name: string
    state: StopState
    timing: string
    output: string | null
    error: string | null
    // Whether its name is a step's, as the code names it
    code: boolean
}

function nowRow(state: StopState, name: string): RailRow {
    return {
        key: state,
        name,
        state,
        timing: "",
        output: null,
        error: null,
        code: false
    }
}

// The line from a stop down to the next one
function Track({ into }: { into: StopState }) {
    return (
        <span
            aria-hidden
            className={cn(
                "absolute top-3 -bottom-1 left-[calc(0.75rem-1.5px)] w-[3px]",
                into === "waiting"
                    ? "w-0 border-muted-foreground/40 border-l-[3px] border-dashed"
                    : into === "failed"
                      ? "bg-destructive"
                      : "bg-primary"
            )}
        />
    )
}

/**
 * That a screen is live: a dot that beats each time it hears from the
 * API, and how long ago that was.
 */
export function LiveNote({
    updated,
    className
}: {
    updated: number
    className?: string
}) {
    const now = useNow(1000)
    const seconds = Math.max(0, Math.round((now.getTime() - updated) / 1000))
    return (
        <span
            className={cn(
                "inline-flex items-center gap-2 text-muted-foreground text-xs tabular-nums",
                className
            )}
        >
            <span aria-hidden className="relative flex size-2">
                <span
                    key={updated}
                    className="absolute inset-0 animate-ping rounded-full bg-success/60 [animation-iteration-count:1] motion-reduce:hidden"
                />
                <span className="relative size-2 rounded-full bg-success" />
            </span>
            Live, {seconds < 3 ? "just now" : `${seconds} s ago`}
        </span>
    )
}

/** Draws again every so often, so "4 min ago" stays true. */
export function useNow(every = 15_000) {
    const [now, setNow] = useState(() => new Date())
    useEffect(() => {
        const timer = setInterval(() => setNow(new Date()), every)
        return () => clearInterval(timer)
    }, [every])
    return now
}
