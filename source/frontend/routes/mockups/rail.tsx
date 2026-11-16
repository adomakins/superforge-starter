import { createFileRoute, Link } from "@tanstack/react-router"
import { cn } from "cn"
import { ChevronDown, CircleAlert, RotateCcw, Search } from "lucide-react"
import { useMemo, useState } from "react"
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
    RunTiming,
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
    type RunState as RunStateName,
    samplePeople,
    since,
    useLiveRuns,
    YOU
} from "@/frontend/components/mockups/sample-data"
import { Button } from "@/frontend/components/primitives/button"
import { Input } from "@/frontend/components/primitives/input"

// Direction A, the rail: the home page's line becomes the dashboard's
// navigation, a stop for each screen, and a copy's next feature is a new
// stop on it. Analytics, still to come, is a dashed one. Each screen is a
// plain page beside it, an overview first.

const VIEWS = ["overview", "people", "workflows", "account"] as const
type View = (typeof VIEWS)[number]

export const Route = createFileRoute("/mockups/rail")({
    validateSearch: z.object({
        view: z.enum(VIEWS).optional().catch(undefined),
        run: z.string().optional().catch(undefined)
    }),
    component: Rail
})

const heading = "font-heading font-semibold text-2xl tracking-tight"
const subheading = "font-heading font-semibold text-base tracking-tight"
const textLink =
    "text-sm underline decoration-foreground/40 underline-offset-4 hover:decoration-foreground"

function Rail() {
    const { as = "internal", view = "overview" } = Route.useSearch()
    const live = useLiveRuns()
    if (as === "customer") {
        return <CustomerAccount />
    } else {
        return (
            <div className="mx-auto grid w-full max-w-6xl grid-cols-[minmax(0,1fr)] gap-8 px-5 py-6 sm:px-8 sm:py-10 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-14">
                <RailNav view={view} />
                <main className="flex min-w-0 flex-col gap-8">
                    {view === "overview" && <Overview live={live} />}
                    {view === "people" && <People live={live} />}
                    {view === "workflows" && <Workflows live={live} />}
                    {view === "account" && (
                        <>
                            <header className="flex flex-col gap-1.5">
                                <h1 className={heading}>Your account</h1>
                                <p className="text-muted-foreground">
                                    You're one of the business's own, so you see
                                    everything here.
                                </p>
                            </header>
                            <AccountPanel who={YOU} className="max-w-2xl" />
                        </>
                    )}
                </main>
            </div>
        )
    }
}

type Live = ReturnType<typeof useLiveRuns>

// The rail: each screen a stop on the line, the one you're on filled, and
// Analytics dashed, since it's still to come. On a phone it's a row of tabs
// along the top.
const STOPS: { view: View; name: string }[] = [
    { view: "overview", name: "Overview" },
    { view: "people", name: "People" },
    { view: "workflows", name: "Workflows" }
]

function RailNav({ view }: { view: View }) {
    return (
        <aside className="flex flex-col gap-6 lg:sticky lg:top-10 lg:self-start">
            <BusinessMark />
            <nav aria-label="Dashboard">
                <ol className="flex gap-1 overflow-x-auto lg:flex-col lg:gap-0">
                    {STOPS.map((stop) => (
                        <li
                            key={stop.view}
                            className="relative shrink-0 lg:pb-5"
                        >
                            <span
                                aria-hidden
                                className="absolute top-4 -bottom-0 left-[calc(0.75rem-1.5px)] hidden w-[3px] bg-primary lg:block"
                            />
                            <Link
                                to="/mockups/rail"
                                search={(previous) => ({
                                    theme: previous.theme,
                                    as: previous.as,
                                    view: stop.view
                                })}
                                aria-current={
                                    view === stop.view ? "page" : undefined
                                }
                                className="group flex items-center gap-3 rounded-md px-2.5 py-1.5 text-muted-foreground text-sm transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring aria-[current=page]:font-medium aria-[current=page]:text-foreground max-lg:aria-[current=page]:bg-muted lg:px-0 lg:py-0"
                            >
                                <Stop
                                    state={
                                        view === stop.view ? "done" : "running"
                                    }
                                    size="large"
                                    className="relative z-10 ml-1 hidden lg:inline-block [&>span]:hidden"
                                />
                                {stop.name}
                            </Link>
                        </li>
                    ))}
                    <li className="relative hidden shrink-0 lg:block lg:pb-8">
                        <span className="flex items-center gap-3 text-muted-foreground text-sm">
                            <Stop
                                state="waiting"
                                size="large"
                                className="ml-1"
                            />
                            <span className="flex flex-col">
                                Analytics
                                <span className="text-xs">
                                    Coming with Infra
                                </span>
                            </span>
                        </span>
                    </li>
                    <li className="shrink-0 lg:border-t lg:pt-5">
                        <Link
                            to="/mockups/rail"
                            search={(previous) => ({
                                theme: previous.theme,
                                as: previous.as,
                                view: "account"
                            })}
                            aria-current={
                                view === "account" ? "page" : undefined
                            }
                            className="flex flex-col rounded-md px-2.5 py-1.5 text-muted-foreground text-sm transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring aria-[current=page]:text-foreground max-lg:aria-[current=page]:bg-muted lg:px-0 lg:py-0"
                        >
                            <span className="lg:font-medium lg:text-foreground">
                                <span className="lg:hidden">Account</span>
                                <span className="hidden lg:inline">
                                    {YOU.name}
                                </span>
                            </span>
                            <span className="hidden truncate text-xs lg:block">
                                {YOU.email}
                            </span>
                        </Link>
                    </li>
                </ol>
            </nav>
        </aside>
    )
}

function Overview({ live }: { live: Live }) {
    const now = useNow()
    const people = useMemo(samplePeople, [])
    const failed = live.runs.filter((run) => run.state === "failed")
    const week = 7 * 24 * 60 * 60 * 1000
    const recent = live.runs.filter(
        (run) => now.getTime() - run.started.getTime() < week
    )
    const joined = [
        ...(live.arrivedEmail !== null ? [arrivedPerson(live.updated)] : []),
        ...people.filter(
            (person) => now.getTime() - person.joined.getTime() < week
        )
    ]

    return (
        <>
            <header className="flex flex-col gap-1.5">
                <h1 className={heading}>Overview</h1>
                <p className="text-muted-foreground">
                    The last seven days: {joined.length} new people, and{" "}
                    {recent.length} runs of background work
                    {failed.length > 0 ? `, ${failed.length} failed` : ""}.
                </p>
            </header>

            {failed.map((run) => (
                <div
                    key={run.id}
                    role="alert"
                    className="flex flex-col gap-3 rounded-lg bg-destructive/10 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
                >
                    <span className="flex items-start gap-2.5 text-destructive">
                        <CircleAlert
                            aria-hidden
                            className="mt-0.5 size-4 shrink-0"
                        />
                        <span className="text-pretty">
                            Telling the team about {run.about} failed{" "}
                            {since(run.started, now)}.
                        </span>
                    </span>
                    <Link
                        to="/mockups/rail"
                        search={(previous) => ({
                            theme: previous.theme,
                            as: previous.as,
                            view: "workflows",
                            run: run.id
                        })}
                        className={cn(textLink, "shrink-0 text-foreground")}
                    >
                        Open the run
                    </Link>
                </div>
            ))}

            <div className="grid gap-x-12 gap-y-10 xl:grid-cols-2">
                <section className="flex flex-col gap-4">
                    <div className="flex items-baseline justify-between gap-4">
                        <h2 className={subheading}>New people</h2>
                        <ViewLink view="people">Everyone</ViewLink>
                    </div>
                    <ul className="flex flex-col divide-y border-y">
                        {joined.map((person) => (
                            <li
                                key={person.id}
                                className="flex items-center justify-between gap-4 py-3"
                            >
                                <span className="flex min-w-0 flex-col">
                                    <span className="truncate font-medium text-sm">
                                        {nameOf(person)}
                                    </span>
                                    {person.name !== null && (
                                        <span className="truncate text-muted-foreground text-xs">
                                            {person.email}
                                        </span>
                                    )}
                                </span>
                                <span className="flex shrink-0 flex-col items-end">
                                    <RoleWord role={person.role} />
                                    <span className="text-muted-foreground text-xs tabular-nums">
                                        {since(person.joined, now)}
                                    </span>
                                </span>
                            </li>
                        ))}
                    </ul>
                </section>

                <section className="flex flex-col gap-4">
                    <div className="flex items-baseline justify-between gap-4">
                        <h2 className={subheading}>Background work</h2>
                        <ViewLink view="workflows">Every run</ViewLink>
                    </div>
                    <ul className="flex flex-col divide-y border-y">
                        {live.runs.slice(0, 5).map((run) => (
                            <li
                                key={run.id}
                                className="flex items-center gap-3 py-3"
                            >
                                <Stop state={runStop(run.state)} size="large" />
                                <span className="flex min-w-0 flex-1 flex-col">
                                    <span className="truncate text-sm">
                                        {run.about}
                                    </span>
                                    <RunTiming run={run} now={now} />
                                </span>
                                <RunLine steps={run.steps} />
                            </li>
                        ))}
                    </ul>
                </section>
            </div>
        </>
    )
}

function ViewLink({ view, children }: { view: View; children: string }) {
    return (
        <Link
            to="/mockups/rail"
            search={(previous) => ({
                theme: previous.theme,
                as: previous.as,
                view
            })}
            className={textLink}
        >
            {children}
        </Link>
    )
}

type Filter = "everyone" | "internal" | "customer"

function People({ live }: { live: Live }) {
    const now = useNow()
    const [people, setPeople] = useState(samplePeople)
    const [filter, setFilter] = useState<Filter>("everyone")
    const [query, setQuery] = useState("")
    const everyone: Person[] = [
        ...(live.arrivedEmail !== null ? [arrivedPerson(live.updated)] : []),
        ...people
    ]
    const counts = {
        everyone: everyone.length,
        internal: everyone.filter((person) => person.role === "internal")
            .length,
        customer: everyone.filter((person) => person.role === "customer").length
    }
    const shown = everyone.filter(
        (person) =>
            (filter === "everyone" || person.role === filter) &&
            (query === "" ||
                `${person.name ?? ""} ${person.email}`
                    .toLowerCase()
                    .includes(query.toLowerCase()))
    )

    function update(id: string, change: Partial<Person>) {
        setPeople((all) =>
            all.map((person) =>
                person.id === id ? { ...person, ...change } : person
            )
        )
    }

    return (
        <>
            <header className="flex flex-col gap-1.5">
                <h1 className={heading}>People</h1>
                <p className="max-w-prose text-pretty text-muted-foreground">
                    Everyone who can sign in. Internal people see this
                    dashboard; customers see only their own account.
                </p>
            </header>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <FilterTabs
                    value={filter}
                    onChange={setFilter}
                    options={[
                        {
                            value: "everyone",
                            label: "Everyone",
                            count: counts.everyone
                        },
                        {
                            value: "internal",
                            label: "Internal",
                            count: counts.internal
                        },
                        {
                            value: "customer",
                            label: "Customers",
                            count: counts.customer
                        }
                    ]}
                />
                <div className="relative sm:w-64">
                    <Search
                        aria-hidden
                        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                    />
                    <Input
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Find by name or email"
                        aria-label="Find someone"
                        className="h-9 pl-9"
                    />
                </div>
            </div>

            {shown.length === 0 ? (
                <p className="rounded-lg border border-dashed px-4 py-6 text-center text-muted-foreground text-sm">
                    No one matches “{query}”. Someone becomes a person here the
                    first time they sign in.
                </p>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="border-b text-muted-foreground text-xs">
                            <tr>
                                <th className="py-2 pr-4 font-medium">
                                    Person
                                </th>
                                <th className="py-2 pr-4 font-medium">Role</th>
                                <th className="hidden py-2 pr-4 font-medium md:table-cell">
                                    Joined
                                </th>
                                <th className="hidden py-2 pr-4 font-medium sm:table-cell">
                                    Last signed in
                                </th>
                                <th className="hidden py-2 font-medium sm:table-cell">
                                    <span className="sr-only">Remove</span>
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {shown.map((person) => {
                                const you = person.email === YOU.email
                                return (
                                    <tr
                                        key={person.id}
                                        className="align-middle"
                                    >
                                        <td className="max-w-64 py-3 pr-4">
                                            <span className="flex flex-col">
                                                <span className="truncate font-medium">
                                                    {nameOf(person)}
                                                    {you && (
                                                        <span className="ml-2 font-normal text-muted-foreground text-xs">
                                                            You
                                                        </span>
                                                    )}
                                                </span>
                                                {person.name !== null && (
                                                    <span className="truncate text-muted-foreground text-xs">
                                                        {person.email}
                                                    </span>
                                                )}
                                            </span>
                                        </td>
                                        <td className="py-3 pr-4">
                                            <span className="sm:hidden">
                                                <RoleWord role={person.role} />
                                            </span>
                                            <span className="hidden sm:block">
                                                <RoleSwitch
                                                    person={person}
                                                    disabled={you}
                                                    onChange={(role) =>
                                                        update(person.id, {
                                                            role
                                                        })
                                                    }
                                                />
                                            </span>
                                        </td>
                                        <td
                                            className="hidden py-3 pr-4 text-muted-foreground tabular-nums md:table-cell"
                                            title={moment(person.joined)}
                                        >
                                            {since(person.joined, now)}
                                        </td>
                                        <td className="hidden py-3 pr-4 text-muted-foreground tabular-nums sm:table-cell">
                                            {person.signed_in === null
                                                ? "Never"
                                                : since(person.signed_in, now)}
                                        </td>
                                        <td className="hidden py-3 text-right sm:table-cell">
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
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </>
    )
}

function FilterTabs<Value extends string>({
    value,
    onChange,
    options
}: {
    value: Value
    onChange: (value: Value) => void
    options: { value: Value; label: string; count: number }[]
}) {
    return (
        <div role="tablist" className="flex flex-wrap gap-1">
            {options.map((option) => (
                <button
                    key={option.value}
                    type="button"
                    role="tab"
                    aria-selected={value === option.value}
                    onClick={() => onChange(option.value)}
                    className="rounded-md px-2.5 py-1.5 text-muted-foreground text-sm transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring aria-selected:bg-muted aria-selected:font-medium aria-selected:text-foreground"
                >
                    {option.label}{" "}
                    <span className="text-muted-foreground tabular-nums">
                        {option.count}
                    </span>
                </button>
            ))}
        </div>
    )
}

type RunFilter = "all" | RunStateName

function Workflows({ live }: { live: Live }) {
    const now = useNow(1000)
    const { run: opened } = Route.useSearch()
    const [filter, setFilter] = useState<RunFilter>("all")
    const [open, setOpen] = useState<string | null>(opened ?? null)
    const count = (state: RunStateName) =>
        live.runs.filter((run) => run.state === state).length
    const shown = live.runs.filter(
        (run) =>
            filter === "all" ||
            run.state === filter ||
            (filter === "running" && run.state === "queued")
    )

    return (
        <>
            <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div className="flex flex-col gap-1.5">
                    <h1 className={heading}>Workflows</h1>
                    <p className="max-w-prose text-pretty text-muted-foreground">
                        Background work, as it runs. Each run is a line of its
                        steps, filled as each one finishes.
                    </p>
                </div>
                <LiveNote updated={live.updated} />
            </header>

            <FilterTabs
                value={filter}
                onChange={setFilter}
                options={[
                    { value: "all", label: "All", count: live.runs.length },
                    {
                        value: "running",
                        label: "Running",
                        count: count("running") + count("queued")
                    },
                    {
                        value: "failed",
                        label: "Failed",
                        count: count("failed")
                    },
                    {
                        value: "succeeded",
                        label: "Done",
                        count: count("succeeded")
                    }
                ]}
            />

            {shown.length === 0 ? (
                <p className="rounded-lg border border-dashed px-4 py-6 text-center text-muted-foreground text-sm">
                    Nothing running right now. A run shows up here the moment
                    it's queued.
                </p>
            ) : (
                <ul className="flex flex-col divide-y border-y">
                    {shown.map((run) => (
                        <RunRow
                            key={run.id}
                            run={run}
                            now={now}
                            open={open === run.id}
                            onToggle={() =>
                                setOpen((current) =>
                                    current === run.id ? null : run.id
                                )
                            }
                        />
                    ))}
                </ul>
            )}
        </>
    )
}

function RunRow({
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
    return (
        <li>
            <button
                type="button"
                aria-expanded={open}
                onClick={onToggle}
                className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 py-3.5 text-left transition-colors hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-ring sm:grid-cols-[7rem_minmax(0,1fr)_auto_auto] sm:px-2"
            >
                <RunStatus run={run} className="hidden sm:inline-flex" />
                <span className="flex min-w-0 flex-col">
                    <span className="truncate text-sm">
                        Tell the team about{" "}
                        <span className="font-medium">{run.about}</span>
                    </span>
                    <span className="flex items-center gap-2">
                        <RunStatus run={run} className="text-xs sm:hidden" />
                        <RunTiming run={run} now={now} />
                    </span>
                </span>
                <RunLine steps={run.steps} className="hidden sm:inline-flex" />
                <ChevronDown
                    aria-hidden
                    className={cn(
                        "size-4 text-muted-foreground transition-transform duration-200",
                        open && "rotate-180"
                    )}
                />
            </button>
            {open && (
                <div className="grid gap-x-10 gap-y-6 pt-2 pb-6 sm:grid-cols-[minmax(0,1fr)_16rem] sm:px-2">
                    <StepRail run={run} />
                    <dl className="flex flex-col gap-3 text-sm">
                        <div>
                            <dt className="text-muted-foreground text-xs">
                                Workflow
                            </dt>
                            <dd className="font-mono text-xs">
                                {run.workflow}
                            </dd>
                        </div>
                        <div>
                            <dt className="text-muted-foreground text-xs">
                                Started
                            </dt>
                            <dd className="tabular-nums">
                                {moment(run.started)}
                            </dd>
                        </div>
                        <div>
                            <dt className="text-muted-foreground text-xs">
                                Input
                            </dt>
                            <dd className="font-mono text-xs">{run.input}</dd>
                        </div>
                        <div>
                            <dt className="text-muted-foreground text-xs">
                                Run
                            </dt>
                            <dd className="font-mono text-xs">{run.id}</dd>
                        </div>
                        {run.state === "failed" && (
                            <Button
                                variant="outline"
                                className="mt-1 h-9 w-fit px-3"
                            >
                                <RotateCcw aria-hidden />
                                Try again from the failed step
                            </Button>
                        )}
                    </dl>
                </div>
            )}
        </li>
    )
}

// A customer's whole dashboard: their account, alone, laid out like the
// sign-in page they came through
function CustomerAccount() {
    return (
        <main className="mx-auto flex max-w-xl flex-col gap-10 px-5 py-6 sm:py-10">
            <header className="flex items-center justify-between gap-4">
                <Link
                    to="/"
                    className="rounded-sm focus-visible:outline-2 focus-visible:outline-ring"
                >
                    <BusinessMark />
                </Link>
            </header>
            <section className="flex flex-col gap-2 sm:mt-6">
                <h1 className="text-balance font-heading font-semibold text-3xl tracking-tight">
                    Your account
                </h1>
                <p className="text-muted-foreground">
                    Signed in as{" "}
                    <span className="font-medium text-foreground">
                        {CUSTOMER.email}
                    </span>
                    .
                </p>
            </section>
            <AccountPanel who={CUSTOMER} />
        </main>
    )
}
