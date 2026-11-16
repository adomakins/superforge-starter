import { cn } from "cn"
import { useEffect, useState } from "react"
import {
    RUN_STATE_NAMES,
    type Run,
    type RunState,
    type Step,
    type StepState,
    since,
    took
} from "./sample-data"

// The home page's line, carried into the dashboard: a workflow's run is a
// short line of its steps, each a stop, filled once it's done, a ring while
// it runs, dashed while it waits, and red where it failed. The same marks in
// every direction, drawn in the theme's main color.

const DOT: Record<StepState, string> = {
    done: "border-primary bg-primary",
    running: "border-primary bg-background",
    waiting: "border-muted-foreground/45 border-dashed bg-background",
    failed: "border-destructive bg-background"
}

/** One stop: a step's, or a run's as a whole. */
export function Stop({
    state,
    size = "small",
    className
}: {
    state: StepState
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
                DOT[state],
                className
            )}
        >
            {state === "running" && (
                <span className="absolute -inset-[3px] animate-ping rounded-full border-2 border-primary/60 motion-reduce:hidden" />
            )}
        </span>
    )
}

/** A run's state as a stop: done is filled, failed red, queued dashed. */
export function runStop(state: RunState): StepState {
    switch (state) {
        case "succeeded":
            return "done"
        case "running":
            return "running"
        case "queued":
            return "waiting"
        case "failed":
            return "failed"
    }
}

/** A run's steps as a short line, for a row in a list. */
export function RunLine({
    steps,
    className
}: {
    steps: Step[]
    className?: string
}) {
    const summary = steps
        .map((step) => `${step.name} ${STEP_STATE_WORDS[step.state]}`)
        .join(", ")
    return (
        <span
            role="img"
            aria-label={`Steps: ${summary}`}
            className={cn("inline-flex items-center", className)}
        >
            {steps.map((step, index) => (
                <span key={step.name} className="inline-flex items-center">
                    {index > 0 && <Connector into={step.state} />}
                    <Stop state={step.state} />
                </span>
            ))}
        </span>
    )
}

// The stretch of line into a step: solid once the step has started, dashed
// while it waits
function Connector({ into }: { into: StepState }) {
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

const STEP_STATE_WORDS: Record<StepState, string> = {
    done: "done",
    running: "running",
    waiting: "waiting",
    failed: "failed"
}

/** A run's state in words, beside its stop. */
export function RunStatus({
    run,
    className
}: {
    run: Run
    className?: string
}) {
    return (
        <span
            className={cn(
                "inline-flex items-center gap-2 text-sm",
                run.state === "failed" ? "text-destructive" : "text-foreground",
                className
            )}
        >
            <Stop state={runStop(run.state)} />
            {RUN_STATE_NAMES[run.state]}
        </span>
    )
}

/**
 * A run's steps down a line, each with how long it took and what it
 * returned, and what it threw where it failed: the run's detail.
 */
export function StepRail({ run }: { run: Run }) {
    return (
        <ol>
            {run.steps.map((step, index) => {
                const last = index === run.steps.length - 1
                const next = run.steps[index + 1]
                return (
                    <li
                        key={step.name}
                        className={cn(
                            "relative grid grid-cols-[1.5rem_minmax(0,1fr)] gap-x-3",
                            !last && "pb-5"
                        )}
                    >
                        {next !== undefined && <Track into={next.state} />}
                        <Stop
                            state={step.state}
                            size="large"
                            className="mt-0.5 justify-self-center"
                        />
                        <div className="flex min-w-0 flex-col gap-1.5">
                            <div className="flex items-baseline justify-between gap-4">
                                <span className="font-mono text-sm">
                                    {step.name}
                                </span>
                                <span className="shrink-0 text-muted-foreground text-xs tabular-nums">
                                    {step.milliseconds !== null
                                        ? took(step.milliseconds)
                                        : step.state === "running"
                                          ? "running"
                                          : step.state === "waiting"
                                            ? "waiting"
                                            : "gave up"}
                                </span>
                            </div>
                            {step.output !== undefined && (
                                <code className="w-fit max-w-full truncate font-mono text-muted-foreground text-xs">
                                    {step.output}
                                </code>
                            )}
                            {step.error !== undefined && (
                                <p className="rounded-md bg-destructive/10 px-3 py-2 text-destructive text-sm leading-relaxed">
                                    {step.error}
                                </p>
                            )}
                        </div>
                    </li>
                )
            })}
        </ol>
    )
}

// The line from a step down to the next one
function Track({ into }: { into: StepState }) {
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
 * That the screen is live: a dot that beats each time it hears from the
 * API, and how long ago that was.
 */
export function LiveNote({
    updated,
    className
}: {
    updated: Date
    className?: string
}) {
    const [now, setNow] = useState(() => new Date())
    useEffect(() => {
        const timer = setInterval(() => setNow(new Date()), 1000)
        return () => clearInterval(timer)
    }, [])
    const seconds = Math.max(
        0,
        Math.round((now.getTime() - updated.getTime()) / 1000)
    )
    return (
        <span
            className={cn(
                "inline-flex items-center gap-2 text-muted-foreground text-xs tabular-nums",
                className
            )}
        >
            <span aria-hidden className="relative flex size-2">
                <span
                    key={updated.getTime()}
                    className="absolute inset-0 animate-ping rounded-full bg-success/60 [animation-iteration-count:1] motion-reduce:hidden"
                />
                <span className="relative size-2 rounded-full bg-success" />
            </span>
            Live, {seconds < 2 ? "just now" : `${seconds} s ago`}
        </span>
    )
}

/** When a run started, and how long it took once it's finished. */
export function RunTiming({ run, now }: { run: Run; now: Date }) {
    return (
        <span className="text-muted-foreground text-xs tabular-nums">
            {since(run.started, now)}
            {run.milliseconds !== null && <> · took {took(run.milliseconds)}</>}
        </span>
    )
}

/** Re-renders every few seconds, so "4 min ago" stays true. */
export function useNow(every = 5000) {
    const [now, setNow] = useState(() => new Date())
    useEffect(() => {
        const timer = setInterval(() => setNow(new Date()), every)
        return () => clearInterval(timer)
    }, [every])
    return now
}
