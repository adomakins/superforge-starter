import { createFileRoute } from "@tanstack/react-router"
import { cn } from "cn"
import { RotateCw } from "lucide-react"
import {
    BusinessMark,
    EnvironmentChip,
    IN_DEVELOPMENT
} from "@/frontend/components/mockups/environment"
import { Footer } from "@/frontend/components/mockups/footer"
import { useHealth } from "@/frontend/components/mockups/health"
import { PLANNED_PARTS } from "@/frontend/components/mockups/planned"
import {
    PromptChip,
    SayToClaude
} from "@/frontend/components/mockups/say-to-claude"
import {
    apiStatus,
    databaseStatus,
    deployStatus,
    type Recovery,
    RecoveryNote,
    recoveryFor,
    type Status,
    StatusLine,
    storageStatus,
    websiteStatus
} from "@/frontend/components/mockups/status"
import { Button } from "@/frontend/components/primitives/button"

export const Route = createFileRoute("/mockups/manifest")({
    component: Manifest
})

// Direction A: what's in the box, as a packing list whose last column the
// page checks off live, from the one health check

type Part = {
    name: string
    what: string
    path: string | null
    status: Status
    // Which part this is, when a failed check can be about it
    checks?: Recovery["part"]
}

const PLANNED: Part[] = PLANNED_PARTS.map((part) => ({
    name: part.name,
    what: part.whatInFull,
    path: part.path,
    status: { tone: "planned", label: "Planned" }
}))

const NEXT_ASKS = [
    {
        prompt: "Add a page about our services",
        touches: "a new route in source/frontend/routes/"
    },
    {
        prompt: "Keep a list of our customers",
        touches: "a table in schema.ts, and routes under /api"
    },
    {
        prompt: "Add a contact form",
        touches: "a form, a route that takes it, a table to keep it"
    },
    {
        prompt: "Put it online",
        touches: "Railway, set up once (workbench/commit-and-deploy.md)"
    }
] as const

function Manifest() {
    const { health, checkedAt, checking, checkAgain } = useHealth()
    const recovery = recoveryFor(health)

    const parts: Part[] = [
        {
            name: "Website",
            what: "The pages people see, each one built ahead of time.",
            path: "source/frontend/",
            status: websiteStatus()
        },
        {
            name: "API",
            what: "Everything the site reads and writes goes through it, under /api.",
            path: "source/backend/",
            status: apiStatus(health),
            checks: "api"
        },
        {
            name: "Database",
            what: "Postgres, for what the business keeps: customers, orders, bookings.",
            path: "source/database/schema.ts",
            status: databaseStatus(health),
            checks: "database"
        },
        {
            name: "Storage",
            what: "Files: uploads, images, exports.",
            path: "source/database/storage/",
            status: storageStatus()
        },
        {
            name: "Deploys",
            what: "Online on Railway, from each change you merge, once its checks pass.",
            path: ".railway/railway.ts",
            status: deployStatus()
        }
    ]

    return (
        <main className="mx-auto flex max-w-3xl flex-col gap-14 px-5 py-6 sm:px-8 sm:py-10">
            <header className="flex items-center justify-between gap-4">
                <BusinessMark />
                <EnvironmentChip />
            </header>

            <section className="flex flex-col gap-7">
                <div className="flex flex-col gap-3">
                    <h1 className="text-balance font-heading font-semibold text-3xl tracking-tight sm:text-4xl">
                        Here's what you've got.
                    </h1>
                    <p className="max-w-[58ch] text-pretty text-muted-foreground leading-relaxed">
                        A website, an API and a database, in one codebase you
                        own, running{" "}
                        {IN_DEVELOPMENT ? "on your computer" : "online"}.
                        Nothing in it is anyone's yet.
                    </p>
                </div>
                <SayToClaude
                    prompt="start here"
                    detail="Claude asks about your business, then sets your colors, fonts and words, and replaces this page with yours."
                    className="max-w-xl"
                />
            </section>

            <section
                aria-labelledby="in-the-box"
                className="flex flex-col gap-3"
            >
                <div className="flex items-center justify-between gap-4">
                    <h2
                        id="in-the-box"
                        className="font-heading font-semibold text-lg tracking-tight"
                    >
                        In the box
                    </h2>
                    <span className="flex items-center gap-1">
                        {checkedAt !== null && !checking && (
                            <span className="text-muted-foreground text-xs tabular-nums">
                                Checked at{" "}
                                {checkedAt.toLocaleTimeString([], {
                                    hour: "numeric",
                                    minute: "2-digit",
                                    second: "2-digit"
                                })}
                            </span>
                        )}
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={checkAgain}
                            disabled={checking}
                            className="-mr-2 text-muted-foreground"
                        >
                            <RotateCw
                                aria-hidden
                                className={cn(
                                    checking &&
                                        "animate-spin motion-reduce:animate-none"
                                )}
                            />
                            Check again
                        </Button>
                    </span>
                </div>

                <div className="@container">
                    <div
                        aria-hidden
                        className="hidden grid-cols-[7rem_minmax(0,1fr)_12rem] gap-x-6 border-b pb-2 text-muted-foreground text-xs @xl:grid"
                    >
                        <span>Part</span>
                        <span>What it's for, and where it lives</span>
                        <span>Right now</span>
                    </div>
                    <ul>
                        {parts.map((part) => (
                            <PartRow
                                key={part.name}
                                part={part}
                                recovery={
                                    recovery !== null &&
                                    recovery.part === part.checks
                                        ? recovery
                                        : null
                                }
                            />
                        ))}
                    </ul>

                    <h3 className="mt-8 border-b pb-2 font-medium text-muted-foreground text-xs">
                        Coming to Foundation
                    </h3>
                    <ul>
                        {PLANNED.map((part) => (
                            <PartRow key={part.name} part={part} planned />
                        ))}
                    </ul>
                </div>
            </section>

            <section aria-labelledby="then" className="flex flex-col gap-4">
                <div className="flex flex-col gap-1">
                    <h2
                        id="then"
                        className="font-heading font-semibold text-lg tracking-tight"
                    >
                        Then, ask for what the business needs
                    </h2>
                    <p className="text-muted-foreground text-sm">
                        Each is a sentence to Claude. Under it, what it would
                        change.
                    </p>
                </div>
                <ul className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
                    {NEXT_ASKS.map((ask) => (
                        <li key={ask.prompt} className="flex flex-col gap-1.5">
                            <PromptChip prompt={ask.prompt} className="w-fit" />
                            <span className="pl-3 text-muted-foreground text-xs">
                                {ask.touches}
                            </span>
                        </li>
                    ))}
                </ul>
            </section>

            <Footer />
        </main>
    )
}

// One part: its name, what it's for and where it lives, and its status. In
// a wide container, three aligned columns; in a narrow one, the name and
// status on one line and the rest under them. A part the check failed on
// says how to fix it, right under it.
function PartRow({
    part,
    planned = false,
    recovery = null
}: {
    part: Part
    planned?: boolean
    recovery?: Recovery | null
}) {
    return (
        <li className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 border-b py-3.5 last:border-b-0 @xl:grid-cols-[7rem_minmax(0,1fr)_12rem] @xl:gap-x-6">
            <span
                className={cn(
                    "font-medium text-sm",
                    planned && "text-muted-foreground"
                )}
            >
                {part.name}
            </span>
            <StatusLine
                status={part.status}
                className="col-start-2 row-start-1 w-fit justify-self-end @xl:col-start-3 @xl:justify-self-start"
            />
            <span className="col-span-2 flex flex-col gap-1 @xl:col-span-1 @xl:col-start-2 @xl:row-start-1">
                <span className="text-pretty text-muted-foreground text-sm">
                    {part.what}
                </span>
                {part.path !== null && (
                    <code className="font-mono text-foreground/70 text-xs">
                        {part.path}
                    </code>
                )}
            </span>
            {recovery !== null && (
                <RecoveryNote
                    recovery={recovery}
                    className="col-span-2 mt-2 @xl:col-span-2 @xl:col-start-2"
                />
            )}
        </li>
    )
}
