import { useEffect, useState } from "react"

// Made-up rows for the dashboard's mockups, the same in all three
// directions: the people who can sign in, this browser's sessions, and the
// runs of the one workflow the template ships, which tells the business's
// own people when someone new signs up. The real dashboard reads all of it
// through the API; here it's written out, with times counted back from when
// the page opened.

/** Who someone is to the business: one of its own, or someone it serves. */
export type Role = "internal" | "customer"

export type Person = {
    id: string
    email: string
    name: string | null
    role: Role
    joined: Date
    // Null for someone added by hand who hasn't signed in yet
    signed_in: Date | null
    sessions: number
}

export type Session = {
    id: string
    device: string
    started: Date
    last_used: Date
    current: boolean
}

export type StepState = "done" | "running" | "waiting" | "failed"

export type Step = {
    name: string
    state: StepState
    milliseconds: number | null
    // What the step returned, as DBOS keeps it, or what it threw
    output?: string
    error?: string
}

export type RunState = "queued" | "running" | "succeeded" | "failed"

export type Run = {
    id: string
    workflow: string
    // Whom the run is about, from its input
    about: string
    state: RunState
    started: Date
    milliseconds: number | null
    steps: Step[]
    input: string
}

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

function ago(milliseconds: number) {
    return new Date(Date.now() - milliseconds)
}

/** The person viewing: one of the business's own. */
export const YOU = {
    email: "ada@example.com",
    name: "Ada Lovelace"
}

/** A customer viewing the same dashboard, who sees only their own account. */
export const CUSTOMER = {
    email: "maria.santos@example.com",
    name: "Maria Santos"
}

export function samplePeople(): Person[] {
    return [
        {
            id: "p-maria",
            email: "maria.santos@example.com",
            name: "Maria Santos",
            role: "customer",
            joined: ago(2 * HOUR),
            signed_in: ago(2 * HOUR),
            sessions: 1
        },
        {
            id: "p-jun",
            email: "jun.park@example.com",
            name: "Jun Park",
            role: "customer",
            joined: ago(19 * HOUR),
            signed_in: ago(5 * HOUR),
            sessions: 2
        },
        {
            id: "p-olu",
            email: "olu.adeyemi@example.com",
            name: null,
            role: "customer",
            joined: ago(26 * HOUR),
            signed_in: ago(26 * HOUR),
            sessions: 1
        },
        {
            id: "p-ada",
            email: "ada@example.com",
            name: "Ada Lovelace",
            role: "internal",
            joined: ago(94 * DAY),
            signed_in: ago(2 * DAY),
            sessions: 2
        },
        {
            id: "p-priya",
            email: "priya.nair@example.com",
            name: "Priya Nair",
            role: "customer",
            joined: ago(3 * DAY),
            signed_in: ago(3 * DAY),
            sessions: 1
        },
        {
            id: "p-tom",
            email: "tom.becker@example.com",
            name: "Tom Becker",
            role: "customer",
            joined: ago(8 * DAY),
            signed_in: ago(30 * HOUR),
            sessions: 1
        },
        {
            id: "p-grace",
            email: "grace@example.com",
            name: "Grace Hopper",
            role: "internal",
            joined: ago(91 * DAY),
            signed_in: ago(45 * DAY),
            sessions: 0
        },
        {
            id: "p-lena",
            email: "lena.k@example.com",
            name: null,
            role: "customer",
            joined: ago(21 * DAY),
            signed_in: ago(12 * DAY),
            sessions: 0
        },
        {
            id: "p-linus",
            email: "linus@example.com",
            name: null,
            role: "customer",
            joined: ago(40 * DAY),
            signed_in: null,
            sessions: 0
        }
    ]
}

export function sampleSessions(): Session[] {
    return [
        {
            id: "s-1",
            device: "Chrome on a Mac",
            started: ago(12 * DAY),
            last_used: ago(MINUTE / 2),
            current: true
        },
        {
            id: "s-2",
            device: "Safari on an iPhone",
            started: ago(31 * DAY),
            last_used: ago(2 * DAY),
            current: false
        },
        {
            id: "s-3",
            device: "Firefox on Windows",
            started: ago(26 * DAY),
            last_used: ago(19 * DAY),
            current: false
        }
    ]
}

// The workflow the template ships, and its three steps
export const WORKFLOW = "tell-team-of-sign-up"
const STEP_NAMES = ["read-user", "find-team", "send-notice"] as const

function steps(
    states: [StepState, StepState, StepState],
    milliseconds: [number | null, number | null, number | null],
    about: string,
    error?: string
): Step[] {
    const outputs = [
        `{ "email": "${about}" }`,
        `{ "internal": 2 }`,
        `{ "logged": true }`
    ]
    return STEP_NAMES.map((name, index) => {
        const state = states[index] ?? "waiting"
        return {
            name,
            state,
            milliseconds: milliseconds[index] ?? null,
            output: state === "done" ? outputs[index] : undefined,
            error: state === "failed" ? error : undefined
        }
    })
}

function run(
    id: string,
    about: string,
    state: RunState,
    started: Date,
    milliseconds: number | null,
    step_list: Step[]
): Run {
    return {
        id,
        workflow: WORKFLOW,
        about,
        state,
        started,
        milliseconds,
        steps: step_list,
        input: `{ "user_id": "${id.replace("run-", "")}" }`
    }
}

export function sampleRuns(): Run[] {
    return [
        run(
            "run-7f3a91",
            "maria.santos@example.com",
            "succeeded",
            ago(2 * HOUR),
            412,
            steps(["done", "done", "done"], [38, 22, 352], "maria")
        ),
        run(
            "run-6c0e27",
            "olu.adeyemi@example.com",
            "failed",
            ago(26 * HOUR),
            1_262_000,
            steps(
                ["done", "done", "failed"],
                [41, 19, null],
                "olu",
                "Infra didn't answer: 503 Service Unavailable, after 8 attempts over 21 minutes"
            )
        ),
        run(
            "run-5d84b2",
            "jun.park@example.com",
            "succeeded",
            ago(19 * HOUR),
            388,
            steps(["done", "done", "done"], [35, 24, 329], "jun")
        ),
        run(
            "run-4a2f10",
            "priya.nair@example.com",
            "succeeded",
            ago(3 * DAY),
            451,
            steps(["done", "done", "done"], [44, 21, 386], "priya")
        ),
        run(
            "run-39b7cc",
            "tom.becker@example.com",
            "succeeded",
            ago(8 * DAY),
            397,
            steps(["done", "done", "done"], [37, 20, 340], "tom")
        )
    ].sort((one, other) => other.started.getTime() - one.started.getTime())
}

// The run a live dashboard would see arrive while it's open: someone signs
// up a few seconds after the page opens, and the run that tells the team
// goes from queued to done, a step at a time
const ARRIVING_EMAIL = "nadia.rahman@example.com"
const TIMELINE = [
    { at: 3000, state: "queued" as const, done: 0 },
    { at: 4400, state: "running" as const, done: 0 },
    { at: 5200, state: "running" as const, done: 1 },
    { at: 5900, state: "running" as const, done: 2 },
    { at: 7400, state: "succeeded" as const, done: 3 }
]

/**
 * The runs as a live screen would show them, polling the API: the sample
 * runs, then a new sign-up's run arriving and finishing a few seconds after
 * the page opens. `updated` is when the screen last heard.
 */
export function useLiveRuns() {
    const [opened] = useState(() => Date.now())
    const [elapsed, setElapsed] = useState(0)
    const [runs] = useState(sampleRuns)

    useEffect(() => {
        const timer = setInterval(() => setElapsed(Date.now() - opened), 250)
        return () => clearInterval(timer)
    }, [opened])

    const stage = [...TIMELINE].reverse().find((point) => elapsed >= point.at)
    let arriving: Run | null = null
    if (stage !== undefined) {
        const states: StepState[] = STEP_NAMES.map((_, index) => {
            if (index < stage.done) {
                return "done"
            } else if (index === stage.done && stage.state === "running") {
                return "running"
            } else {
                return "waiting"
            }
        })
        arriving = run(
            "run-8e1d44",
            ARRIVING_EMAIL,
            stage.state,
            new Date(opened + 3000),
            stage.state === "succeeded" ? 431 : null,
            steps(
                [
                    states[0] ?? "waiting",
                    states[1] ?? "waiting",
                    states[2] ?? "waiting"
                ],
                [
                    stage.done > 0 ? 36 : null,
                    stage.done > 1 ? 23 : null,
                    stage.done > 2 ? 372 : null
                ],
                "nadia"
            )
        )
    }

    // Polled every two seconds, as the real screen would
    const updated = new Date(opened + Math.floor(elapsed / 2000) * 2000)
    return {
        runs: arriving === null ? runs : [arriving, ...runs],
        arrivedEmail: arriving === null ? null : ARRIVING_EMAIL,
        updated
    }
}

/** The person whose sign-up the live run is about, once they've signed up. */
export function arrivedPerson(opened: Date): Person {
    return {
        id: "p-nadia",
        email: ARRIVING_EMAIL,
        name: "Nadia Rahman",
        role: "customer",
        joined: opened,
        signed_in: opened,
        sessions: 1
    }
}

// How long ago, in words, for a list: "just now", "4 min ago", "2 h ago",
// "yesterday", then the date
export function since(when: Date, now: Date = new Date()) {
    const elapsed = now.getTime() - when.getTime()
    if (elapsed < MINUTE) {
        return "just now"
    } else if (elapsed < HOUR) {
        return `${Math.floor(elapsed / MINUTE)} min ago`
    } else if (elapsed < DAY) {
        return `${Math.floor(elapsed / HOUR)} h ago`
    } else if (elapsed < 2 * DAY) {
        return "yesterday"
    } else if (elapsed < 7 * DAY) {
        return `${Math.floor(elapsed / DAY)} days ago`
    } else {
        return when.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric"
        })
    }
}

/** The moment in full, for a title or a detail. */
export function moment(when: Date) {
    return when.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit"
    })
}

/** How long something took: "412 ms", "1.3 s", "21 min". */
export function took(milliseconds: number) {
    if (milliseconds < 1000) {
        return `${milliseconds} ms`
    } else if (milliseconds < MINUTE) {
        return `${(milliseconds / 1000).toFixed(1)} s`
    } else {
        return `${Math.round(milliseconds / MINUTE)} min`
    }
}

/** What a run's state is called on screen. */
export const RUN_STATE_NAMES: Record<RunState, string> = {
    queued: "Queued",
    running: "Running",
    succeeded: "Done",
    failed: "Failed"
}

/** What a role is called on screen. */
export const ROLE_NAMES: Record<Role, string> = {
    internal: "Internal",
    customer: "Customer"
}

/** A person's name, or their address when they haven't given one. */
export function nameOf(person: { name: string | null; email: string }) {
    return person.name ?? person.email
}
