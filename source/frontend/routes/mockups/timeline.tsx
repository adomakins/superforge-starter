import { createFileRoute, Link } from "@tanstack/react-router"
import { cn } from "cn"
import { ChevronDown, LogOut, RotateCcw, Search } from "lucide-react"
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react"
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
    ROLE_NAMES,
    type Run,
    samplePeople,
    since,
    took,
    useLiveRuns,
    YOU
} from "@/frontend/components/mockups/sample-data"
import { Button } from "@/frontend/components/primitives/button"
import { Input } from "@/frontend/components/primitives/input"

// Direction B, the timeline: the dashboard opens on what's happening, one
// line down the page with every sign-up and every run of background work a
// stop on it, newest first. A run opens as a branch off the line, its steps
// down it. People and the account are the other two tabs.

const TABS = ["activity", "people", "account"] as const
type Tab = (typeof TABS)[number]

export const Route = createFileRoute("/mockups/timeline")({
    validateSearch: z.object({
        tab: z.enum(TABS).optional().catch(undefined)
    }),
    component: Timeline
})

const heading =
    "text-balance font-heading font-semibold text-3xl tracking-tight"

const TAB_NAMES: Record<Tab, string> = {
    activity: "Activity",
    people: "People",
    account: "Account"
}

function Timeline() {
    const { as = "internal", tab = "activity" } = Route.useSearch()
    const live = useLiveRuns()
    const customer = as === "customer"
    return (
        <>
            <TopBar tab={tab} customer={customer} />
            <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-5 py-8 sm:px-8 sm:py-12">
                {customer ? (
                    <>
                        <header className="flex flex-col gap-2">
                            <h1 className={heading}>Your account</h1>
                            <p className="text-muted-foreground">
                                Signed in as{" "}
                                <span className="font-medium text-foreground">
                                    {CUSTOMER.email}
                                </span>
                                .
                            </p>
                        </header>
                        <AccountPanel who={CUSTOMER} />
                    </>
                ) : tab === "activity" ? (
                    <Activity live={live} />
                ) : tab === "people" ? (
                    <People live={live} />
                ) : (
                    <>
                        <header className="flex flex-col gap-2">
                            <h1 className={heading}>Your account</h1>
                            <p className="text-muted-foreground">
                                You're one of the business's own, so you see its
                                activity and its people too.
                            </p>
                        </header>
                        <AccountPanel who={YOU} />
                    </>
                )}
            </main>
        </>
    )
}

// The bar across the top: the business, the tabs, and who's signed in. A
// customer has no tabs, only their account.
function TopBar({ tab, customer }: { tab: Tab; customer: boolean }) {
    return (
        <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur-sm">
            <div className="mx-auto flex h-14 w-full max-w-3xl items-center gap-6 px-5 sm:px-8">
                <BusinessMark className="shrink-0" />
                {!customer && (
                    <nav
                        aria-label="Dashboard"
                        className="-mb-px flex h-full items-stretch gap-1"
                    >
                        {TABS.map((each) => (
                            <Link
                                key={each}
                                to="/mockups/timeline"
                                search={(previous) => ({
                                    theme: previous.theme,
                                    as: previous.as,
                                    tab: each
                                })}
                                aria-current={tab === each ? "page" : undefined}
                                className="flex items-center border-transparent border-b-2 px-2 text-muted-foreground text-sm transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring aria-[current=page]:border-primary aria-[current=page]:font-medium aria-[current=page]:text-foreground"
                            >
                                {TAB_NAMES[each]}
                            </Link>
                        ))}
                    </nav>
                )}
                <span className="ml-auto hidden truncate text-muted-foreground text-sm sm:block">
                    {customer ? CUSTOMER.email : YOU.email}
                </span>
                {customer && (
                    <Button
                        variant="ghost"
                        size="sm"
                        className="ml-auto sm:ml-0"
                    >
                        <LogOut aria-hidden />
                        Sign out
                    </Button>
                )}
            </div>
        </header>
    )
}

type Live = ReturnType<typeof useLiveRuns>

// Everything that happened, as stops on one line: someone signing up, and
// each run of background work
type Event =
    | { kind: "sign-up"; id: string; at: Date; person: Person }
    | { kind: "run"; id: string; at: Date; run: Run }

type Filter = "everything" | "sign-ups" | "work" | "problems"

function Activity({ live }: { live: Live }) {
    const now = useNow()
    const people = useMemo(samplePeople, [])
    const [filter, setFilter] = useState<Filter>("everything")
    const [open, setOpen] = useState<string | null>(null)

    const arrived =
        live.arrivedEmail !== null
            ? [arrivedPerson(new Date(live.runs[0]?.started.getTime() ?? 0))]
            : []
    const events: Event[] = [
        ...[...arrived, ...people].map(
            (person): Event => ({
                kind: "sign-up",
                id: `joined-${person.id}`,
                // The sign-up comes a moment before the run it starts
                at: new Date(person.joined.getTime() - 1000),
                person
            })
        ),
        ...live.runs.map(
            (run): Event => ({ kind: "run", id: run.id, at: run.started, run })
        )
    ].sort((one, other) => other.at.getTime() - one.at.getTime())

    const shown = events.filter((event) => {
        if (filter === "sign-ups") {
            return event.kind === "sign-up"
        } else if (filter === "work") {
            return event.kind === "run"
        } else if (filter === "problems") {
            return event.kind === "run" && event.run.state === "failed"
        } else {
            return true
        }
    })

    // The day each event falls on, so the line can say where a day starts
    const days = new Map<string, Event[]>()
    for (const event of shown) {
        const day = dayName(event.at, now)
        days.set(day, [...(days.get(day) ?? []), event])
    }

    const problems = events.filter(
        (event) => event.kind === "run" && event.run.state === "failed"
    ).length

    return (
        <>
            <header className="flex flex-col gap-3">
                <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
                    <h1 className={heading}>What's happening</h1>
                    <LiveNote updated={live.updated} className="pb-1.5" />
                </div>
                <p className="max-w-prose text-pretty text-muted-foreground leading-relaxed">
                    Sign-ups, and the background work each one starts, newest
                    first. A new stop appears at the top as it happens.
                </p>
            </header>

            <div role="tablist" className="flex flex-wrap gap-2">
                {(
                    [
                        ["everything", "Everything"],
                        ["sign-ups", "Sign-ups"],
                        ["work", "Background work"],
                        ["problems", `Problems ${problems}`]
                    ] as const
                ).map(([value, label]) => (
                    <button
                        key={value}
                        type="button"
                        role="tab"
                        aria-selected={filter === value}
                        onClick={() => setFilter(value)}
                        className={cn(
                            "rounded-full border px-3 py-1 text-sm transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring aria-selected:border-primary aria-selected:bg-primary aria-selected:text-primary-foreground",
                            value === "problems" &&
                                problems > 0 &&
                                "text-destructive aria-selected:border-destructive aria-selected:bg-destructive aria-selected:text-background"
                        )}
                    >
                        {label}
                    </button>
                ))}
            </div>

            {shown.length === 0 ? (
                <p className="rounded-lg border border-dashed px-4 py-6 text-center text-muted-foreground text-sm">
                    Nothing here. When something fails, it shows up here first.
                </p>
            ) : (
                <div className="flex flex-col">
                    {[...days.entries()].map(([day, list], dayIndex) => (
                        <section key={day} aria-label={day}>
                            <h2
                                className={cn(
                                    "relative grid grid-cols-[2rem_minmax(0,1fr)] gap-x-4 pb-4 font-medium text-muted-foreground text-xs",
                                    dayIndex > 0 && "pt-2"
                                )}
                            >
                                <span
                                    aria-hidden
                                    className={cn(
                                        "absolute -bottom-0 left-[calc(1rem-2px)] w-1 bg-primary",
                                        dayIndex === 0 ? "top-2" : "top-0"
                                    )}
                                />
                                <span className="col-start-2">{day}</span>
                            </h2>
                            <ol>
                                {list.map((event, index) => (
                                    <EventRow
                                        key={event.id}
                                        event={event}
                                        now={now}
                                        last={
                                            dayIndex === days.size - 1 &&
                                            index === list.length - 1
                                        }
                                        open={open === event.id}
                                        onToggle={() =>
                                            setOpen((current) =>
                                                current === event.id
                                                    ? null
                                                    : event.id
                                            )
                                        }
                                    />
                                ))}
                            </ol>
                        </section>
                    ))}
                </div>
            )}
        </>
    )
}

function dayName(when: Date, now: Date) {
    const start = new Date(now)
    start.setHours(0, 0, 0, 0)
    const day = 24 * 60 * 60 * 1000
    if (when.getTime() >= start.getTime()) {
        return "Today"
    } else if (when.getTime() >= start.getTime() - day) {
        return "Yesterday"
    } else {
        return when.toLocaleDateString("en-US", {
            weekday: "long",
            month: "short",
            day: "numeric"
        })
    }
}

// One stop on the line. A run opens as a branch off it, with its steps.
// A stop that has only just arrived comes in with the line's pulse.
function EventRow({
    event,
    now,
    last,
    open,
    onToggle
}: {
    event: Event
    now: Date
    last: boolean
    open: boolean
    onToggle: () => void
}) {
    return (
        <li
            className={cn(
                "relative grid grid-cols-[2rem_minmax(0,1fr)] gap-x-4",
                !last && "pb-6"
            )}
        >
            {!last && (
                <span
                    aria-hidden
                    className="absolute top-3 -bottom-3 left-[calc(1rem-2px)] w-1 bg-primary"
                />
            )}
            {event.kind === "sign-up" ? (
                <SignUpStop person={event.person} now={now} />
            ) : (
                <RunStop
                    run={event.run}
                    now={now}
                    open={open}
                    onToggle={onToggle}
                />
            )}
        </li>
    )
}

// Whether something happened since the page opened, so it can say it's new
function useFresh(at: Date) {
    const opened = useRef(Date.now())
    return at.getTime() > opened.current - 2000
}

function SignUpStop({ person, now }: { person: Person; now: Date }) {
    return (
        <>
            <span
                aria-hidden
                className="relative z-10 col-start-1 mt-1 size-4 justify-self-center rounded-full border-[3px] border-primary bg-background"
            />
            <div className="flex min-w-0 flex-col gap-0.5">
                <Line when={person.joined} now={now}>
                    <span className="font-medium">{nameOf(person)}</span> signed
                    up
                </Line>
                <span className="truncate text-muted-foreground text-sm">
                    {person.name !== null && <>{person.email} · </>}
                    {ROLE_NAMES[person.role]}
                </span>
            </div>
        </>
    )
}

function RunStop({
    run,
    now,
    open,
    onToggle
}: {
    run: Run
    now: Date
    open: boolean
    onToggle: () => void
}) {
    const words = {
        queued: "Waiting to tell the team about",
        running: "Telling the team about",
        succeeded: "Told the team about",
        failed: "Couldn't tell the team about"
    }[run.state]
    return (
        <>
            <Stop
                state={runStop(run.state)}
                size="large"
                className="relative z-10 col-start-1 mt-1 justify-self-center"
            />
            <div className="flex min-w-0 flex-col gap-1">
                <button
                    type="button"
                    aria-expanded={open}
                    onClick={onToggle}
                    className="-mx-2 -my-1 flex flex-col gap-1 rounded-md px-2 py-1 text-left transition-colors hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-ring"
                >
                    <Line when={run.started} now={now}>
                        <span
                            className={cn(
                                run.state === "failed" && "text-destructive"
                            )}
                        >
                            {words}
                        </span>{" "}
                        <span className="font-medium">{run.about}</span>
                    </Line>
                    <span className="flex items-center gap-3 text-muted-foreground text-sm">
                        <RunLine steps={run.steps} />
                        <span className="tabular-nums">
                            {run.milliseconds !== null
                                ? `took ${took(run.milliseconds)}`
                                : run.state === "queued"
                                  ? "queued"
                                  : "running"}
                        </span>
                        <ChevronDown
                            aria-hidden
                            className={cn(
                                "size-4 transition-transform duration-200",
                                open && "rotate-180"
                            )}
                        />
                    </span>
                </button>
                {open && <RunBranch run={run} />}
            </div>
        </>
    )
}

// A run's detail as a branch off the line, as the home page draws Storage
// and the workflows: its steps down a line of their own, then what it was
// started with
function RunBranch({ run }: { run: Run }) {
    return (
        <div className="relative mt-3 flex flex-col gap-5 pl-6">
            <span
                aria-hidden
                className="absolute top-0 bottom-2 left-0 w-1 rounded-full bg-primary/30"
            />
            <StepRail run={run} />
            <p className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground text-xs">
                <span className="font-mono">{run.workflow}</span>
                <span className="font-mono">{run.input}</span>
                <span className="tabular-nums">{moment(run.started)}</span>
            </p>
            {run.state === "failed" && (
                <Button variant="outline" className="h-9 w-fit px-3">
                    <RotateCcw aria-hidden />
                    Try again from the failed step
                </Button>
            )}
        </div>
    )
}

// What happened, with when on the right where there's room for both
function Line({
    when,
    now,
    children
}: {
    when: Date
    now: Date
    children: ReactNode
}) {
    const fresh = useFresh(when)
    return (
        <span className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
            <span className="min-w-0 text-pretty">{children}</span>
            <span
                className="shrink-0 text-muted-foreground text-xs tabular-nums"
                title={moment(when)}
            >
                {fresh && (
                    <span className="mr-2 font-medium text-primary">New</span>
                )}
                {since(when, now)}
            </span>
        </span>
    )
}

function People({ live }: { live: Live }) {
    const now = useNow()
    const [people, setPeople] = useState(samplePeople)
    const [query, setQuery] = useState("")
    const [open, setOpen] = useState<string | null>(null)
    const [arrival, setArrival] = useState<Person | null>(null)
    useEffect(() => {
        if (live.arrivedEmail !== null && arrival === null) {
            setArrival(arrivedPerson(new Date()))
        }
    }, [live.arrivedEmail, arrival])

    const everyone = [...(arrival !== null ? [arrival] : []), ...people]
    const shown = everyone.filter(
        (person) =>
            query === "" ||
            `${person.name ?? ""} ${person.email}`
                .toLowerCase()
                .includes(query.toLowerCase())
    )
    const internal = everyone.filter((person) => person.role === "internal")

    return (
        <>
            <header className="flex flex-col gap-3">
                <h1 className={heading}>People</h1>
                <p className="max-w-prose text-pretty text-muted-foreground leading-relaxed">
                    {everyone.length} people can sign in. {internal.length} are
                    the business's own and see this dashboard; the rest are
                    customers, who see only their account.
                </p>
            </header>

            <div className="relative">
                <Search
                    aria-hidden
                    className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Find by name or email"
                    aria-label="Find someone"
                    className="h-10 pl-9"
                />
            </div>

            {shown.length === 0 ? (
                <p className="rounded-lg border border-dashed px-4 py-6 text-center text-muted-foreground text-sm">
                    No one matches “{query}”.
                </p>
            ) : (
                <ul className="flex flex-col divide-y border-y">
                    {shown.map((person) => {
                        const you = person.email === YOU.email
                        const isOpen = open === person.id
                        return (
                            <li key={person.id}>
                                <button
                                    type="button"
                                    aria-expanded={isOpen}
                                    onClick={() =>
                                        setOpen(isOpen ? null : person.id)
                                    }
                                    className="flex w-full items-center gap-4 py-3.5 text-left transition-colors hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-ring sm:px-2"
                                >
                                    <span className="flex min-w-0 flex-1 flex-col">
                                        <span className="truncate font-medium text-sm">
                                            {nameOf(person)}
                                            {you && (
                                                <span className="ml-2 font-normal text-muted-foreground text-xs">
                                                    You
                                                </span>
                                            )}
                                        </span>
                                        <span className="truncate text-muted-foreground text-xs">
                                            {person.name !== null && (
                                                <>{person.email} · </>
                                            )}
                                            {person.signed_in === null
                                                ? "never signed in"
                                                : `signed in ${since(person.signed_in, now)}`}
                                        </span>
                                    </span>
                                    <RoleWord role={person.role} />
                                    <ChevronDown
                                        aria-hidden
                                        className={cn(
                                            "size-4 shrink-0 text-muted-foreground transition-transform duration-200",
                                            isOpen && "rotate-180"
                                        )}
                                    />
                                </button>
                                {isOpen && (
                                    <div className="flex flex-col gap-4 pb-5 sm:px-2">
                                        <dl className="grid grid-cols-[7rem_minmax(0,1fr)] gap-y-2 text-sm">
                                            <dt className="text-muted-foreground">
                                                Joined
                                            </dt>
                                            <dd className="tabular-nums">
                                                {moment(person.joined)}
                                            </dd>
                                            <dt className="text-muted-foreground">
                                                Signed in on
                                            </dt>
                                            <dd className="tabular-nums">
                                                {person.sessions === 1
                                                    ? "1 browser"
                                                    : `${person.sessions} browsers`}
                                            </dd>
                                            <dt className="self-center text-muted-foreground">
                                                Role
                                            </dt>
                                            <dd>
                                                <RoleSwitch
                                                    person={person}
                                                    disabled={you}
                                                    onChange={(role) =>
                                                        setPeople((all) =>
                                                            all.map((each) =>
                                                                each.id ===
                                                                person.id
                                                                    ? {
                                                                          ...each,
                                                                          role
                                                                      }
                                                                    : each
                                                            )
                                                        )
                                                    }
                                                />
                                            </dd>
                                        </dl>
                                        <RemoveControl
                                            person={person}
                                            disabled={you}
                                            onRemove={() =>
                                                setPeople((all) =>
                                                    all.filter(
                                                        (each) =>
                                                            each.id !==
                                                            person.id
                                                    )
                                                )
                                            }
                                        />
                                    </div>
                                )}
                            </li>
                        )
                    })}
                </ul>
            )}
        </>
    )
}
