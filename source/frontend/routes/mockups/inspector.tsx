import { createFileRoute, Link } from "@tanstack/react-router"
import { cn } from "cn"
import { ArrowLeft, LogOut, RotateCcw, Search } from "lucide-react"
import { type ReactNode, useState } from "react"
import { z } from "zod"
import {
    AccountPanel,
    BusinessMark,
    RemoveControl,
    RoleSwitch,
    RoleWord
} from "@/frontend/components/mockups/account"
import {
    LiveNote,
    RunLine,
    RunStatus,
    runStop,
    StepRail,
    Stop,
    useNow
} from "@/frontend/components/mockups/marks"
import {
    arrivedPerson,
    CUSTOMER,
    moment,
    nameOf,
    type Person,
    type Run,
    samplePeople,
    since,
    took,
    useLiveRuns,
    YOU
} from "@/frontend/components/mockups/sample-data"
import { Button } from "@/frontend/components/primitives/button"
import { Input } from "@/frontend/components/primitives/input"

// Direction C, the inspector: a list on the left and what's chosen on the
// right, as a mail client lays it out, so a failed run or a person is one
// click from everything about it. The run's steps run down its own line,
// at full size. On a phone the list and the detail are one screen each.

const SECTIONS = ["workflows", "people", "account"] as const
type Section = (typeof SECTIONS)[number]

export const Route = createFileRoute("/mockups/inspector")({
    validateSearch: z.object({
        section: z.enum(SECTIONS).optional().catch(undefined),
        selected: z.string().optional().catch(undefined)
    }),
    component: Inspector
})

function Inspector() {
    const { as = "internal", section = "workflows" } = Route.useSearch()
    const live = useLiveRuns()
    const customer = as === "customer"
    return (
        <div className="flex h-[calc(100dvh-4.5rem)] min-h-[32rem] flex-col">
            <TopBar section={section} customer={customer} />
            {customer ? (
                <SinglePane>
                    <header className="flex flex-col gap-2">
                        <h1 className="font-heading font-semibold text-2xl tracking-tight">
                            Your account
                        </h1>
                        <p className="text-muted-foreground">
                            Signed in as{" "}
                            <span className="font-medium text-foreground">
                                {CUSTOMER.email}
                            </span>
                            .
                        </p>
                    </header>
                    <AccountPanel who={CUSTOMER} />
                </SinglePane>
            ) : section === "workflows" ? (
                <Workflows live={live} />
            ) : section === "people" ? (
                <People live={live} />
            ) : (
                <SinglePane>
                    <h1 className="font-heading font-semibold text-2xl tracking-tight">
                        Your account
                    </h1>
                    <AccountPanel who={YOU} />
                </SinglePane>
            )}
        </div>
    )
}

const SECTION_NAMES: Record<Section, string> = {
    workflows: "Workflows",
    people: "People",
    account: "Account"
}

function TopBar({
    section,
    customer
}: {
    section: Section
    customer: boolean
}) {
    return (
        <header className="flex h-14 shrink-0 items-center gap-4 border-b bg-sidebar px-4 sm:px-5">
            <BusinessMark className="shrink-0" />
            {!customer && (
                <nav
                    aria-label="Dashboard"
                    className="flex rounded-lg border bg-background p-0.5"
                >
                    {(["workflows", "people"] as const).map((each) => (
                        <Link
                            key={each}
                            to="/mockups/inspector"
                            search={(previous) => ({
                                theme: previous.theme,
                                as: previous.as,
                                section: each
                            })}
                            aria-current={section === each ? "page" : undefined}
                            className="rounded-md px-3 py-1 text-muted-foreground text-sm transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring aria-[current=page]:bg-primary aria-[current=page]:font-medium aria-[current=page]:text-primary-foreground"
                        >
                            {SECTION_NAMES[each]}
                        </Link>
                    ))}
                </nav>
            )}
            <span className="ml-auto flex items-center gap-1">
                {customer ? (
                    <Button variant="ghost" size="sm">
                        <LogOut aria-hidden />
                        Sign out
                    </Button>
                ) : (
                    <Link
                        to="/mockups/inspector"
                        search={(previous) => ({
                            theme: previous.theme,
                            as: previous.as,
                            section: "account"
                        })}
                        aria-current={
                            section === "account" ? "page" : undefined
                        }
                        aria-label="Your account"
                        className="flex items-center gap-2 rounded-md px-1 py-1 text-sm transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring aria-[current=page]:bg-muted sm:px-2"
                    >
                        <span
                            aria-hidden
                            className="flex size-6 items-center justify-center rounded-full bg-primary font-medium text-[0.65rem] text-primary-foreground"
                        >
                            AL
                        </span>
                        <span className="hidden text-muted-foreground sm:inline">
                            {YOU.email}
                        </span>
                    </Link>
                )}
            </span>
        </header>
    )
}

function SinglePane({ children }: { children: ReactNode }) {
    return (
        <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto flex max-w-2xl flex-col gap-8 px-5 py-8 sm:px-8 sm:py-10">
                {children}
            </div>
        </div>
    )
}

// The two panes: the list, and the detail of what's selected. On a phone,
// only one shows at a time: the list until something is selected.
function Panes({
    list,
    detail,
    selected
}: {
    list: ReactNode
    detail: ReactNode
    selected: boolean
}) {
    return (
        <div className="flex min-h-0 flex-1">
            <div
                className={cn(
                    "min-h-0 w-full flex-col border-r bg-sidebar md:flex md:w-[22rem] md:shrink-0",
                    selected ? "hidden" : "flex"
                )}
            >
                {list}
            </div>
            <div
                className={cn(
                    "min-h-0 flex-1 overflow-y-auto md:block",
                    selected ? "block" : "hidden"
                )}
            >
                {detail}
            </div>
        </div>
    )
}

type Live = ReturnType<typeof useLiveRuns>

function Workflows({ live }: { live: Live }) {
    const now = useNow(1000)
    const { selected } = Route.useSearch()
    const failed = live.runs.filter((run) => run.state === "failed")
    const active = live.runs.filter(
        (run) => run.state === "running" || run.state === "queued"
    )
    const done = live.runs.filter((run) => run.state === "succeeded")
    const chosen =
        live.runs.find((run) => run.id === selected) ??
        failed[0] ??
        live.runs[0]

    return (
        <Panes
            selected={selected !== undefined}
            list={
                <>
                    <div className="flex shrink-0 items-center justify-between gap-4 border-b px-4 py-3">
                        <h1 className="font-heading font-semibold text-base tracking-tight">
                            Workflows
                        </h1>
                        <LiveNote updated={live.updated} />
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto pb-4">
                        <RunGroup
                            title="Needs attention"
                            runs={failed}
                            chosen={chosen}
                            now={now}
                        />
                        <RunGroup
                            title="Running"
                            runs={active}
                            chosen={chosen}
                            now={now}
                            empty="Nothing running right now."
                        />
                        <RunGroup
                            title="Done"
                            runs={done}
                            chosen={chosen}
                            now={now}
                        />
                    </div>
                </>
            }
            detail={
                chosen === undefined ? (
                    <p className="p-8 text-muted-foreground text-sm">
                        No runs yet. The first one starts when someone signs up.
                    </p>
                ) : (
                    <RunDetail run={chosen} now={now} />
                )
            }
        />
    )
}

function RunGroup({
    title,
    runs,
    chosen,
    now,
    empty
}: {
    title: string
    runs: Run[]
    chosen: Run | undefined
    now: Date
    empty?: string
}) {
    if (runs.length === 0 && empty === undefined) {
        return null
    }
    return (
        <section className="px-2 pt-4">
            <h2 className="px-2 pb-1.5 font-medium text-muted-foreground text-xs">
                {title}
            </h2>
            {runs.length === 0 ? (
                <p className="px-2 py-2 text-muted-foreground text-sm">
                    {empty}
                </p>
            ) : (
                <ul className="flex flex-col gap-0.5">
                    {runs.map((run) => (
                        <li key={run.id}>
                            <Link
                                to="/mockups/inspector"
                                search={(previous) => ({
                                    theme: previous.theme,
                                    as: previous.as,
                                    section: "workflows",
                                    selected: run.id
                                })}
                                aria-current={
                                    chosen?.id === run.id ? "true" : undefined
                                }
                                className="grid grid-cols-[1rem_minmax(0,1fr)_auto] items-center gap-x-3 rounded-md px-2 py-2 transition-colors hover:bg-background focus-visible:outline-2 focus-visible:outline-ring aria-[current=true]:bg-background aria-[current=true]:shadow-xs aria-[current=true]:ring-1 aria-[current=true]:ring-border"
                            >
                                <Stop state={runStop(run.state)} />
                                <span className="flex min-w-0 flex-col">
                                    <span className="truncate text-sm">
                                        {run.about}
                                    </span>
                                    <span className="truncate font-mono text-muted-foreground text-xs">
                                        {run.workflow}
                                    </span>
                                </span>
                                <span className="text-muted-foreground text-xs tabular-nums">
                                    {since(run.started, now)}
                                </span>
                            </Link>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    )
}

function BackLink({ section }: { section: Section }) {
    return (
        <Link
            to="/mockups/inspector"
            search={(previous) => ({
                theme: previous.theme,
                as: previous.as,
                section
            })}
            className="flex w-fit items-center gap-1.5 text-muted-foreground text-sm hover:text-foreground md:hidden"
        >
            <ArrowLeft aria-hidden className="size-4" />
            {SECTION_NAMES[section]}
        </Link>
    )
}

function RunDetail({ run, now }: { run: Run; now: Date }) {
    return (
        <article className="mx-auto flex max-w-3xl flex-col gap-8 px-5 py-6 sm:px-10 sm:py-8">
            <BackLink section="workflows" />
            <header className="flex flex-col gap-3">
                <h2 className="text-balance font-heading font-semibold text-2xl tracking-tight">
                    Tell the team about {run.about}
                </h2>
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
                    <RunStatus run={run} />
                    <span className="text-muted-foreground tabular-nums">
                        Started {since(run.started, now)}
                    </span>
                    {run.milliseconds !== null && (
                        <span className="text-muted-foreground tabular-nums">
                            Took {took(run.milliseconds)}
                        </span>
                    )}
                    <RunLine steps={run.steps} />
                </div>
                {run.state === "failed" && (
                    <div className="flex flex-col gap-3 rounded-lg bg-destructive/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-pretty text-destructive text-sm">
                            It stopped at its last step. Trying again starts
                            from there, keeping what the first two returned.
                        </p>
                        <Button variant="outline" className="h-9 shrink-0 px-3">
                            <RotateCcw aria-hidden />
                            Try again
                        </Button>
                    </div>
                )}
            </header>

            <section className="flex flex-col gap-4">
                <h3 className="font-heading font-semibold text-base tracking-tight">
                    Steps
                </h3>
                <StepRail run={run} />
            </section>

            <section className="grid gap-6 sm:grid-cols-2">
                <div className="flex flex-col gap-2">
                    <h3 className="font-medium text-sm">Started with</h3>
                    <pre className="overflow-x-auto rounded-md bg-muted px-3 py-2.5 font-mono text-xs">
                        {run.input}
                    </pre>
                </div>
                <dl className="flex flex-col gap-2 text-sm">
                    <div className="flex justify-between gap-4">
                        <dt className="text-muted-foreground">Workflow</dt>
                        <dd className="font-mono text-xs">{run.workflow}</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                        <dt className="text-muted-foreground">Run</dt>
                        <dd className="font-mono text-xs">{run.id}</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                        <dt className="text-muted-foreground">Started</dt>
                        <dd className="tabular-nums">{moment(run.started)}</dd>
                    </div>
                </dl>
            </section>
        </article>
    )
}

type RoleFilter = "everyone" | "internal" | "customer"

function People({ live }: { live: Live }) {
    const now = useNow()
    const { selected } = Route.useSearch()
    const [people, setPeople] = useState(samplePeople)
    const [query, setQuery] = useState("")
    const [filter, setFilter] = useState<RoleFilter>("everyone")
    const everyone = [
        ...(live.arrivedEmail !== null
            ? [arrivedPerson(live.runs[0]?.started ?? new Date())]
            : []),
        ...people
    ]
    const shown = everyone.filter(
        (person) =>
            (filter === "everyone" || person.role === filter) &&
            (query === "" ||
                `${person.name ?? ""} ${person.email}`
                    .toLowerCase()
                    .includes(query.toLowerCase()))
    )
    const chosen = everyone.find((person) => person.id === selected) ?? shown[0]

    return (
        <Panes
            selected={selected !== undefined}
            list={
                <>
                    <div className="flex shrink-0 flex-col gap-3 border-b px-4 py-3">
                        <h1 className="font-heading font-semibold text-base tracking-tight">
                            People
                        </h1>
                        <div className="relative">
                            <Search
                                aria-hidden
                                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                            />
                            <Input
                                value={query}
                                onChange={(event) =>
                                    setQuery(event.target.value)
                                }
                                placeholder="Find by name or email"
                                aria-label="Find someone"
                                className="h-9 bg-background pl-9"
                            />
                        </div>
                        <div role="tablist" className="flex gap-1">
                            {(
                                [
                                    ["everyone", "Everyone"],
                                    ["internal", "Internal"],
                                    ["customer", "Customers"]
                                ] as const
                            ).map(([value, label]) => (
                                <button
                                    key={value}
                                    type="button"
                                    role="tab"
                                    aria-selected={filter === value}
                                    onClick={() => setFilter(value)}
                                    className="rounded-md px-2 py-1 text-muted-foreground text-xs transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring aria-selected:bg-background aria-selected:font-medium aria-selected:text-foreground aria-selected:ring-1 aria-selected:ring-border"
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>
                    <ul className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto p-2 pb-4">
                        {shown.length === 0 && (
                            <li className="px-2 py-2 text-muted-foreground text-sm">
                                No one matches “{query}”.
                            </li>
                        )}
                        {shown.map((person) => (
                            <li key={person.id}>
                                <Link
                                    to="/mockups/inspector"
                                    search={(previous) => ({
                                        theme: previous.theme,
                                        as: previous.as,
                                        section: "people",
                                        selected: person.id
                                    })}
                                    aria-current={
                                        chosen?.id === person.id
                                            ? "true"
                                            : undefined
                                    }
                                    className="flex items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-background focus-visible:outline-2 focus-visible:outline-ring aria-[current=true]:bg-background aria-[current=true]:shadow-xs aria-[current=true]:ring-1 aria-[current=true]:ring-border"
                                >
                                    <span className="flex min-w-0 flex-1 flex-col">
                                        <span className="truncate text-sm">
                                            {nameOf(person)}
                                        </span>
                                        <span className="truncate text-muted-foreground text-xs tabular-nums">
                                            joined {since(person.joined, now)}
                                        </span>
                                    </span>
                                    <RoleWord role={person.role} />
                                </Link>
                            </li>
                        ))}
                    </ul>
                </>
            }
            detail={
                chosen === undefined ? null : (
                    <PersonDetail
                        person={chosen}
                        runs={live.runs.filter(
                            (run) => run.about === chosen.email
                        )}
                        now={now}
                        onChange={(change) =>
                            setPeople((all) =>
                                all.map((each) =>
                                    each.id === chosen.id
                                        ? { ...each, ...change }
                                        : each
                                )
                            )
                        }
                        onRemove={() =>
                            setPeople((all) =>
                                all.filter((each) => each.id !== chosen.id)
                            )
                        }
                    />
                )
            }
        />
    )
}

function PersonDetail({
    person,
    runs,
    now,
    onChange,
    onRemove
}: {
    person: Person
    runs: Run[]
    now: Date
    onChange: (change: Partial<Person>) => void
    onRemove: () => void
}) {
    const you = person.email === YOU.email
    return (
        <article className="mx-auto flex max-w-3xl flex-col gap-8 px-5 py-6 sm:px-10 sm:py-8">
            <BackLink section="people" />
            <header className="flex flex-col gap-1">
                <h2 className="text-balance font-heading font-semibold text-2xl tracking-tight">
                    {nameOf(person)}
                    {you && (
                        <span className="ml-3 font-normal font-sans text-base text-muted-foreground tracking-normal">
                            You
                        </span>
                    )}
                </h2>
                {person.name !== null && (
                    <p className="text-muted-foreground">{person.email}</p>
                )}
            </header>

            <dl className="grid grid-cols-[9rem_minmax(0,1fr)] gap-x-4 gap-y-3 text-sm">
                <dt className="self-center text-muted-foreground">Role</dt>
                <dd className="flex flex-wrap items-center gap-3">
                    <RoleSwitch
                        person={person}
                        disabled={you}
                        onChange={(role) => onChange({ role })}
                    />
                    <span className="text-muted-foreground text-xs">
                        {person.role === "internal"
                            ? "Sees this dashboard."
                            : "Sees only their own account."}
                    </span>
                </dd>
                <dt className="text-muted-foreground">Joined</dt>
                <dd className="tabular-nums">{moment(person.joined)}</dd>
                <dt className="text-muted-foreground">Last signed in</dt>
                <dd className="tabular-nums">
                    {person.signed_in === null
                        ? "Never: added by hand"
                        : moment(person.signed_in)}
                </dd>
                <dt className="text-muted-foreground">Signed in on</dt>
                <dd className="tabular-nums">
                    {person.sessions === 0
                        ? "No browsers right now"
                        : person.sessions === 1
                          ? "1 browser"
                          : `${person.sessions} browsers`}
                </dd>
            </dl>

            <section className="flex flex-col gap-3">
                <h3 className="font-heading font-semibold text-base tracking-tight">
                    Background work about them
                </h3>
                {runs.length === 0 ? (
                    <p className="text-muted-foreground text-sm">
                        None in the last week.
                    </p>
                ) : (
                    <ul className="flex flex-col divide-y rounded-lg border">
                        {runs.map((run) => (
                            <li key={run.id}>
                                <Link
                                    to="/mockups/inspector"
                                    search={(previous) => ({
                                        theme: previous.theme,
                                        as: previous.as,
                                        section: "workflows",
                                        selected: run.id
                                    })}
                                    className="flex items-center gap-4 px-4 py-3 text-sm transition-colors hover:bg-muted/50"
                                >
                                    <RunStatus run={run} />
                                    <span className="min-w-0 flex-1 truncate font-mono text-muted-foreground text-xs">
                                        {run.workflow}
                                    </span>
                                    <RunLine steps={run.steps} />
                                    <span className="text-muted-foreground text-xs tabular-nums">
                                        {since(run.started, now)}
                                    </span>
                                </Link>
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            {!you && (
                <section className="flex flex-col gap-2 border-t pt-6">
                    <h3 className="font-medium text-sm">Remove them</h3>
                    <p className="max-w-prose text-pretty text-muted-foreground text-sm">
                        They lose access and every session they have ends. If
                        they sign in again, they come back as someone new.
                    </p>
                    <div className="pt-1">
                        <RemoveControl person={person} onRemove={onRemove} />
                    </div>
                </section>
            )}
        </article>
    )
}
