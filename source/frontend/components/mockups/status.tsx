import { cn } from "cn"
import {
    Circle,
    CircleAlert,
    CircleCheck,
    CircleDashed,
    CircleHelp,
    LoaderCircle
} from "lucide-react"
import type { ReactNode } from "react"
import { IN_DEVELOPMENT } from "./environment"
import type { Health } from "./health"
import { PromptChip } from "./say-to-claude"

/**
 * How sure the page is about a part: seen working, being checked, broken,
 * unknown because something before it broke, a fact it didn't check, or
 * not built yet.
 */
export type Tone =
    | "ok"
    | "checking"
    | "problem"
    | "unknown"
    | "fact"
    | "planned"

export type Status = { tone: Tone; label: string; detail?: ReactNode }

const ICONS = {
    ok: CircleCheck,
    checking: LoaderCircle,
    problem: CircleAlert,
    unknown: CircleHelp,
    fact: Circle,
    planned: CircleDashed
} as const

const ICON_COLORS = {
    ok: "text-success",
    checking: "animate-spin text-muted-foreground motion-reduce:animate-none",
    problem: "text-destructive",
    unknown: "text-muted-foreground",
    fact: "text-muted-foreground/60",
    planned: "text-muted-foreground/60"
} as const

export function StatusIcon({
    tone,
    className
}: {
    tone: Tone
    className?: string
}) {
    const Icon = ICONS[tone]
    return (
        <Icon
            aria-hidden
            className={cn("size-4 shrink-0", ICON_COLORS[tone], className)}
        />
    )
}

/** A status as an icon and a line, with an optional quieter second line. */
export function StatusLine({
    status,
    className
}: {
    status: Status
    className?: string
}) {
    return (
        <span className={cn("flex items-start gap-2 text-sm", className)}>
            <StatusIcon tone={status.tone} className="mt-0.5" />
            <span className="flex min-w-0 flex-col">
                <span
                    className={cn(
                        "tabular-nums",
                        status.tone === "planned" || status.tone === "fact"
                            ? "text-muted-foreground"
                            : "text-foreground"
                    )}
                >
                    {status.label}
                </span>
                {status.detail !== undefined && (
                    <span className="text-muted-foreground text-xs">
                        {status.detail}
                    </span>
                )}
            </span>
        </span>
    )
}

// What each part's status is, from the one health check. The website is up
// if this page is showing; the API is up if it answered at all, even to say
// the database is down; the database is up only if the API reached it.

export function websiteStatus(): Status {
    return { tone: "ok", label: "Serving this page" }
}

export function apiStatus(health: Health): Status {
    switch (health.state) {
        case "checking":
            return { tone: "checking", label: "Checking…" }
        case "up":
        case "database-down":
            return {
                tone: "ok",
                label: `Answered in ${health.milliseconds} ms`
            }
        case "unreachable":
            return { tone: "problem", label: "Not answering" }
    }
}

export function databaseStatus(health: Health): Status {
    switch (health.state) {
        case "checking":
            return { tone: "checking", label: "Checking…" }
        case "up":
            return { tone: "ok", label: "Connected" }
        case "database-down":
            return { tone: "problem", label: "The API can't reach it" }
        case "unreachable":
            return {
                tone: "unknown",
                label: "Unknown",
                detail: "The API didn't answer"
            }
    }
}

export function storageStatus(): Status {
    if (IN_DEVELOPMENT) {
        return {
            tone: "fact",
            label: "A folder on this computer",
            detail: ".storage/, not checked live"
        }
    } else {
        return {
            tone: "fact",
            label: "Railway's bucket",
            detail: "Not checked live"
        }
    }
}

export function deployStatus(): Status {
    if (IN_DEVELOPMENT) {
        return {
            tone: "fact",
            label: "Not online yet",
            detail: "Set up once, when you're ready"
        }
    } else {
        return { tone: "ok", label: "Online" }
    }
}

/**
 * What went wrong when the check failed, the sentence to tell Claude about
 * it, and what else would fix it; nothing when it didn't fail. A dev server
 * and a build have different recoveries. `part` is which part failed, so a
 * page can show it under that part.
 */
export type Recovery = {
    part: "api" | "database"
    problem: string
    prompt: string
    otherwise: string
}

export function recoveryFor(health: Health): Recovery | null {
    switch (health.state) {
        case "checking":
        case "up":
            return null
        case "database-down":
            return {
                part: "database",
                problem: "The database isn't answering.",
                prompt: IN_DEVELOPMENT
                    ? "The database is down"
                    : "The database is down on Railway",
                otherwise: IN_DEVELOPMENT
                    ? "Or restart the dev server: stop it, then run pnpm dev, which starts the database too."
                    : "Or look in Railway's dashboard, which shows whether Postgres is running."
            }
        case "unreachable":
            return {
                part: "api",
                problem: "The server didn't answer.",
                prompt: IN_DEVELOPMENT
                    ? "The dev server stopped"
                    : "The site is down on Railway",
                otherwise: IN_DEVELOPMENT
                    ? "Or start it again yourself with pnpm dev."
                    : "Or look in Railway's deploy logs, which say why."
            }
    }
}

/** What went wrong and how to fix it, to sit under the part that failed. */
export function RecoveryNote({
    recovery,
    className
}: {
    recovery: Recovery
    className?: string
}) {
    return (
        <div
            role="alert"
            className={cn(
                "flex flex-col gap-2 rounded-lg bg-destructive/10 px-4 py-3 text-sm",
                className
            )}
        >
            <p className="font-medium text-destructive">{recovery.problem}</p>
            <p className="flex flex-wrap items-center gap-2">
                <span>Tell Claude</span>
                <PromptChip prompt={recovery.prompt} />
            </p>
            <p className="text-pretty text-muted-foreground text-xs">
                {recovery.otherwise}
            </p>
        </div>
    )
}
