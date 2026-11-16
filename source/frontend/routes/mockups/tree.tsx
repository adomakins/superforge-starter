import { createFileRoute } from "@tanstack/react-router"
import {
    ChevronRight,
    CircleDashed,
    FileCode,
    FileText,
    Folder
} from "lucide-react"
import type { CSSProperties } from "react"
import {
    BusinessMark,
    EnvironmentChip
} from "@/frontend/components/mockups/environment"
import { Footer } from "@/frontend/components/mockups/footer"
import { type Health, useHealth } from "@/frontend/components/mockups/health"
import { PLANNED_PARTS } from "@/frontend/components/mockups/planned"
import {
    PromptChip,
    SayToClaude
} from "@/frontend/components/mockups/say-to-claude"
import {
    apiStatus,
    databaseStatus,
    type Recovery,
    RecoveryNote,
    recoveryFor,
    type Status,
    StatusIcon,
    StatusLine
} from "@/frontend/components/mockups/status"
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger
} from "@/frontend/components/primitives/collapsible"

export const Route = createFileRoute("/mockups/tree")({
    component: Tree
})

// Direction B: the page is the codebase, as an annotated tree, with the file
// that draws this page marked and the API's health check answering in place

type Entry = {
    name: string
    depth: number
    kind: "folder" | "file"
    note: string
    detail?: string
    ask?: string
    mark?: "here" | "first" | "live"
    // Which part this is, when a failed check can be about it
    checks?: Recovery["part"]
    open?: boolean
}

// A tour, not every file: what an owner would want to know first, in the
// order they'd want it
const ENTRIES: Entry[] = [
    {
        name: "START-HERE.md",
        depth: 0,
        kind: "file",
        note: "How this becomes your business's",
        detail: "Claude follows it with you: it asks about the business (its name, its customers, its colors, how it sounds), then sets the look, writes your home page, and names the codebase after you. It deletes itself when it's done.",
        ask: "start here",
        mark: "first",
        open: true
    },
    {
        name: "source/",
        depth: 0,
        kind: "folder",
        note: "Everything that runs"
    },
    {
        name: "frontend/",
        depth: 1,
        kind: "folder",
        note: "The website"
    },
    {
        name: "routes/",
        depth: 2,
        kind: "folder",
        note: "One file for each page"
    },
    {
        name: "index.tsx",
        depth: 3,
        kind: "file",
        note: "This page",
        detail: "START-HERE.md replaces what's here with your business's own page. A new page is a new file beside this one.",
        ask: "Change the home page to say what we do",
        mark: "here",
        open: true
    },
    {
        name: "__root.tsx",
        depth: 3,
        kind: "file",
        note: "What every page shares: its title, description and icon",
        detail: "What a browser tab and a search result show for the site.",
        ask: "Set the site's title and description"
    },
    {
        name: "styles.css",
        depth: 2,
        kind: "file",
        note: "Your colors, fonts and corners",
        detail: "shadcn's theme tokens: a main color, the grays, the fonts and how rounded things are. Every button and field is drawn with them, so changing them restyles the whole site at once.",
        ask: "Make it look like our brand"
    },
    {
        name: "components/",
        depth: 2,
        kind: "folder",
        note: "Buttons, fields, dialogs and menus",
        detail: "shadcn's components, on Base UI, in primitives/. The pieces of your own pages go beside them.",
        ask: "Add a contact form"
    },
    {
        name: "backend/",
        depth: 1,
        kind: "folder",
        note: "The API, under /api",
        checks: "api"
    },
    {
        name: "index.ts",
        depth: 2,
        kind: "file",
        note: "Where each group of routes is added",
        detail: "Everything the site reads or writes is an API route first, so a script or another app can do it too.",
        ask: "Add an API route for bookings"
    },
    {
        name: "health.ts",
        depth: 2,
        kind: "file",
        note: "/api/health, the check this page ran",
        detail: "Railway calls it before a new version takes traffic. It answers whether the server can reach the database.",
        mark: "live"
    },
    {
        name: "database/",
        depth: 1,
        kind: "folder",
        note: "Postgres, through Drizzle",
        checks: "database"
    },
    {
        name: "schema.ts",
        depth: 2,
        kind: "file",
        note: "Your tables, none yet",
        detail: "Where your data is defined. A change here becomes a migration, checked before it ships and run before the next deploy.",
        ask: "Keep a list of our customers"
    },
    {
        name: "storage/",
        depth: 2,
        kind: "folder",
        note: "Files, in the Storage bucket",
        detail: "Online, Railway's bucket. On this computer, the .storage/ folder.",
        ask: "Let customers upload a photo"
    },
    {
        name: "public/",
        depth: 0,
        kind: "folder",
        note: "Your logo and favicon",
        detail: "Files served as they are, from the site's root.",
        ask: "Use our logo"
    },
    {
        name: ".railway/",
        depth: 0,
        kind: "folder",
        note: "Where it runs online, as code",
        detail: "The app, its database and its buckets on Railway, in railway.ts. Each merge to main applies it, once the checks pass.",
        ask: "Put it online"
    },
    {
        name: "workbench/",
        depth: 0,
        kind: "folder",
        note: "How to work on it",
        detail: "What Claude reads before each kind of work: writing-code.md, commit-and-deploy.md, read-webpages.md. And scripts/, the checks every change passes."
    },
    {
        name: "CLAUDE.md",
        depth: 0,
        kind: "file",
        note: "What Claude reads before every change"
    }
]

// One indent step, and where the row's text starts at each depth
const INDENT_REM = 1.25
const PADDING_REM = 0.75
const NAME_COLUMN_REM = 16.5

function Tree() {
    const { health } = useHealth()
    const recovery = recoveryFor(health)
    return (
        <main className="mx-auto flex max-w-3xl flex-col gap-12 px-5 py-6 sm:px-8 sm:py-10">
            <header className="flex items-center justify-between gap-4">
                <BusinessMark />
                <EnvironmentChip />
            </header>

            <section className="flex flex-col gap-7">
                <div className="flex flex-col gap-3">
                    <h1 className="text-balance font-heading font-semibold text-3xl tracking-tight sm:text-4xl">
                        Every file here is yours.
                    </h1>
                    <p className="max-w-[58ch] text-pretty text-muted-foreground leading-relaxed">
                        This page is drawn by{" "}
                        <code className="font-mono text-foreground text-sm">
                            source/frontend/routes/index.tsx
                        </code>
                        . Change it, or anything below, and the page follows as
                        you save. Or don't touch a file: Claude can do all of
                        it.
                    </p>
                </div>
                <SayToClaude
                    prompt="start here"
                    detail="Claude follows START-HERE.md with you: it asks about your business, then changes the files below to make it yours."
                    className="max-w-xl"
                />
            </section>

            <section aria-labelledby="codebase" className="flex flex-col gap-3">
                <div className="@container overflow-hidden rounded-xl border bg-card text-card-foreground">
                    <div className="flex items-baseline justify-between gap-4 border-b px-3 py-2.5">
                        <h2
                            id="codebase"
                            className="flex items-center gap-2 font-medium font-mono text-sm"
                        >
                            <Folder
                                aria-hidden
                                className="size-4 text-muted-foreground"
                            />
                            starter-template
                        </h2>
                        <span className="text-muted-foreground text-xs">
                            A tour, not every file
                        </span>
                    </div>
                    <ul className="py-1.5">
                        {ENTRIES.map((entry) => (
                            <EntryRow
                                key={`${entry.depth}-${entry.name}`}
                                entry={entry}
                                health={health}
                                recovery={
                                    recovery !== null &&
                                    recovery.part === entry.checks
                                        ? recovery
                                        : null
                                }
                            />
                        ))}
                    </ul>
                </div>
            </section>

            <section aria-labelledby="coming" className="flex flex-col gap-3">
                <div className="flex flex-col gap-1">
                    <h2
                        id="coming"
                        className="font-heading font-semibold text-lg tracking-tight"
                    >
                        Coming to Foundation
                    </h2>
                    <p className="text-muted-foreground text-sm">
                        Not in the codebase yet. Each will arrive as an update,
                        in the folder beside it.
                    </p>
                </div>
                <ul className="flex flex-col gap-3">
                    {PLANNED_PARTS.map((part) => (
                        <li
                            key={part.name}
                            className="grid grid-cols-[1rem_minmax(0,1fr)] gap-x-3 text-sm"
                        >
                            <CircleDashed
                                aria-hidden
                                className="mt-0.5 size-4 text-muted-foreground/60"
                            />
                            <span className="flex flex-col gap-0.5">
                                <span>
                                    <span className="font-medium">
                                        {part.name}
                                    </span>{" "}
                                    <span className="text-muted-foreground">
                                        {part.whatInFull}
                                    </span>
                                </span>
                                <code className="font-mono text-foreground/60 text-xs">
                                    {part.path}
                                </code>
                            </span>
                        </li>
                    ))}
                </ul>
            </section>

            <section className="flex flex-col gap-3">
                <h2 className="font-heading font-semibold text-lg tracking-tight">
                    Not sure what something does?
                </h2>
                <p className="flex flex-wrap items-center gap-x-2 gap-y-2 text-muted-foreground text-sm">
                    Ask Claude about any file:
                    <PromptChip prompt="What does health.ts do?" />
                </p>
            </section>

            <Footer />
        </main>
    )
}

// One file or folder: its icon and name at its depth, with the lines of the
// folders it's in, its note, and its mark. One with more to say opens in
// place to say it. The part a failed check was about says how to fix it,
// right under it.
function EntryRow({
    entry,
    health,
    recovery
}: {
    entry: Entry
    health: Health
    recovery: Recovery | null
}) {
    const textStart = PADDING_REM + entry.depth * INDENT_REM
    const guides = Array.from({ length: entry.depth }, (_, level) => level)
    const expandable = entry.detail !== undefined

    // The notes line up in one column whatever the depth: the name's column
    // is narrower the further in the row starts
    const columns: CSSProperties & Record<"--name-column", string> = {
        "--name-column": `${NAME_COLUMN_REM - textStart}rem`
    }
    const line = (
        <span
            className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 gap-y-0.5 @xl:grid-cols-[var(--name-column)_minmax(0,1fr)_auto]"
            style={columns}
        >
            <span className="flex min-w-0 items-center gap-2">
                <EntryIcon entry={entry} />
                <span className="truncate font-mono text-sm">{entry.name}</span>
                {expandable && (
                    <ChevronRight
                        aria-hidden
                        className="size-3.5 shrink-0 text-muted-foreground transition-transform duration-150 group-data-[panel-open]/entry:rotate-90 motion-reduce:transition-none"
                    />
                )}
            </span>
            <span className="col-span-2 row-start-2 pl-6 text-left text-muted-foreground text-sm @xl:col-span-1 @xl:col-start-2 @xl:row-start-1 @xl:pl-0">
                {entry.note}
            </span>
            <span className="col-start-2 row-start-1 flex justify-end @xl:col-start-3">
                <EntryMark
                    entry={entry}
                    health={health}
                    failed={recovery !== null}
                />
            </span>
        </span>
    )

    return (
        <li className="relative">
            {guides.map((level) => (
                <span
                    key={level}
                    aria-hidden
                    className="absolute inset-y-0 w-px bg-border"
                    style={{
                        left: `${PADDING_REM + level * INDENT_REM + 0.5}rem`
                    }}
                />
            ))}
            {expandable ? (
                <Collapsible defaultOpen={entry.open === true}>
                    <CollapsibleTrigger
                        className="group/entry flex w-full rounded-md py-1.5 pr-3 text-left transition-colors hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset data-[panel-open]:bg-muted/50"
                        style={{ paddingLeft: `${textStart}rem` }}
                    >
                        {line}
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                        <div
                            className="flex flex-col gap-3 pt-1.5 pr-3 pb-4"
                            style={{ paddingLeft: `${textStart + 1.5}rem` }}
                        >
                            <p className="max-w-[60ch] text-pretty text-foreground/90 text-sm">
                                {entry.detail}
                            </p>
                            {entry.mark === "live" && (
                                <span className="flex flex-col gap-1.5">
                                    <StatusLine status={apiStatus(health)} />
                                    <StatusLine
                                        status={databaseStatus(health)}
                                    />
                                </span>
                            )}
                            {entry.ask !== undefined && (
                                <span className="flex flex-wrap items-center gap-2">
                                    <span className="text-muted-foreground text-xs">
                                        Ask Claude
                                    </span>
                                    <PromptChip prompt={entry.ask} />
                                </span>
                            )}
                        </div>
                    </CollapsibleContent>
                </Collapsible>
            ) : (
                <div
                    className="flex py-1.5 pr-3"
                    style={{ paddingLeft: `${textStart}rem` }}
                >
                    {line}
                </div>
            )}
            {recovery !== null && (
                <div
                    className="pt-1 pr-3 pb-3"
                    style={{ paddingLeft: `${textStart + 1.5}rem` }}
                >
                    <RecoveryNote recovery={recovery} />
                </div>
            )}
        </li>
    )
}

function EntryIcon({ entry }: { entry: Entry }) {
    const className = "size-4 shrink-0 text-muted-foreground"
    if (entry.kind === "folder") {
        return <Folder aria-hidden className={className} />
    } else if (entry.name.endsWith(".md")) {
        return <FileText aria-hidden className={className} />
    } else {
        return <FileCode aria-hidden className={className} />
    }
}

function EntryMark({
    entry,
    health,
    failed
}: {
    entry: Entry
    health: Health
    failed: boolean
}) {
    if (failed) {
        return (
            <span className="flex items-center gap-1.5 whitespace-nowrap font-medium text-destructive text-xs">
                <StatusIcon tone="problem" className="size-3.5" />
                Not answering
            </span>
        )
    }
    switch (entry.mark) {
        case "here":
            return (
                <span className="whitespace-nowrap rounded-full bg-primary px-2 py-0.5 font-medium text-primary-foreground text-xs">
                    You are here
                </span>
            )
        case "first":
            return (
                <span className="whitespace-nowrap rounded-full border px-2 py-0.5 font-medium text-xs">
                    Read first
                </span>
            )
        case "live": {
            const status = healthMark(health)
            return (
                <span className="flex items-center gap-1.5 whitespace-nowrap text-xs tabular-nums">
                    <StatusIcon tone={status.tone} className="size-3.5" />
                    {status.label}
                </span>
            )
        }
        case undefined:
            return null
    }
}

// What the health check's own file says it found, in words that make sense
// on a file: what it answered, not which part broke
function healthMark(health: Health): Status {
    switch (health.state) {
        case "checking":
            return { tone: "checking", label: "Checking…" }
        case "up":
            return apiStatus(health)
        case "database-down":
            return { tone: "problem", label: "Can't reach the database" }
        case "unreachable":
            return { tone: "problem", label: "No answer" }
    }
}
