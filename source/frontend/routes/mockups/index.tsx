import { createFileRoute, Link } from "@tanstack/react-router"
import { ArrowRight } from "lucide-react"

export const Route = createFileRoute("/mockups/")({
    component: Notes
})

// The notes beside the three mockups: each direction's idea, what a
// customer sees in it, how it grows as a copy adds its own features, and
// its trade-offs, then the questions the build needs answered

const DIRECTIONS = [
    {
        to: "/mockups/rail",
        letter: "A",
        name: "Rail",
        idea: "The home page's line becomes the dashboard's navigation: a stop for each screen down the left, the one you're on filled, Analytics dashed because it's still to come. Each screen is a plain page: an overview first (new people, the latest runs, and a red line when a run failed), then People as a table, Workflows as a list where each run is a short line of its steps, and your account at the foot of the rail.",
        customer:
            "No rail: one narrow page like the sign-in page, with their name, their sign-in email and the browsers they're signed in on.",
        grows: "Best. A copy's next feature (customers, bookings, invoices) is one more stop on the rail and one more page, the way the home page says “each new part runs on this line”.",
        tradeoffs:
            "The most familiar, so the least surprising: an owner knows where everything is at once. The line in the rail is decoration on a standard side nav, and the overview has to earn its place as features arrive, or it becomes a page of lists of lists."
    },
    {
        to: "/mockups/timeline",
        letter: "B",
        name: "Timeline",
        idea: "The dashboard opens on what's happening: one line down the page, every sign-up and every run of background work a stop on it, newest first, by day. A run opens as a branch off the line with its steps, as the home page draws Storage and the workflows. A new sign-up and its run arrive at the top while you watch. People and the account are the other two tabs.",
        customer: "The same top bar with no tabs, and their account below it.",
        grows: "Weakest. Each feature adds kinds of stop to one feed, which floods once a business has many sign-ups a day, and managing anything happens on a tab beside the line, not on it.",
        tradeoffs:
            "The closest to the home page and the most alive: the one an owner would describe an hour later. But it answers “what happened?” better than “who are my customers?” or “why did this fail?”, and a feed needs paging and filters before it holds up for a real business."
    },
    {
        to: "/mockups/inspector",
        letter: "C",
        name: "Inspector",
        idea: "A list on the left and what's chosen on the right, as a mail client lays it out. Workflows opens on the failed run, grouped into needs attention, running and done; the run's steps run down its own line at full size, with what each returned, the error where one failed, and trying again. People works the same way: a person's role, their sessions, the runs about them, and removing them.",
        customer:
            "The top bar with no switch, and their account in a single pane.",
        grows: "Good for records: customers, orders and bookings are lists with details too, so each is one more section in the switch. Less good for anything that isn't a list.",
        tradeoffs:
            "The best for finding out why something failed, and the most app-like. It's the heaviest on a phone, where the list and the detail are a screen each, and two panes are a lot of frame for a business with nine people and one workflow."
    }
] as const

const QUESTIONS = [
    {
        question: "Which roles the template ships.",
        answer: "My suggestion: internal and customer, with customer the default for anyone who signs up. Every role that isn't internal gets the customer's dashboard, so a copy adds its own (lead, contact, partner) by name, in one list, with nothing else to change."
    },
    {
        question: "How the first internal person is made.",
        answer: "My suggestion: an INTERNAL_EMAILS variable on Railway, which START-HERE fills with the owner's email. An address listed there is made internal the first time it signs in; after that, roles change on the People screen. The first sign-in becoming internal is simpler, but on a fresh deploy that can be a stranger."
    },
    {
        question: "Two new columns.",
        answer: "A name on users, which the account page sets, and the browser on sessions (its user agent), so “Where you're signed in” can say “Safari on an iPhone”. When a session was last used comes from its renewal, to within a day, with no new column."
    }
] as const

function Notes() {
    return (
        <main className="mx-auto flex max-w-3xl flex-col gap-12 px-5 py-8 sm:px-8 sm:py-12">
            <section className="flex flex-col gap-4">
                <h1 className="text-balance font-heading font-semibold text-3xl tracking-tight">
                    Foundation's dashboard, three directions
                </h1>
                <p className="max-w-[62ch] text-pretty text-muted-foreground leading-relaxed">
                    What someone sees once they've signed in. Internal people
                    see everyone who can sign in, the workflows as they run, and
                    their own account. Customers see only their account. Each
                    direction is a real route on this dev server, drawn only in
                    the theme's tokens, on made-up rows: someone signs up a few
                    seconds after a page opens, and the run that tells the team
                    arrives and finishes as you watch. The bar at the bottom
                    switches direction, who's viewing, and theme.
                </p>
            </section>

            <ol className="flex flex-col gap-10">
                {DIRECTIONS.map((direction) => (
                    <li
                        key={direction.to}
                        className="flex flex-col gap-4 border-t pt-6"
                    >
                        <div className="flex items-baseline justify-between gap-4">
                            <h2 className="font-heading font-semibold text-xl tracking-tight">
                                <span className="text-muted-foreground">
                                    {direction.letter}
                                </span>{" "}
                                {direction.name}
                            </h2>
                            <Link
                                to={direction.to}
                                search={(previous) => ({
                                    theme: previous.theme,
                                    as: previous.as
                                })}
                                className="inline-flex items-center gap-1 font-medium text-sm underline-offset-4 hover:underline"
                            >
                                Open
                                <ArrowRight aria-hidden className="size-3.5" />
                            </Link>
                        </div>
                        <p className="max-w-[62ch] text-pretty leading-relaxed">
                            {direction.idea}
                        </p>
                        <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[9rem_minmax(0,1fr)]">
                            <dt className="text-muted-foreground">
                                A customer sees
                            </dt>
                            <dd className="text-pretty">
                                {direction.customer}
                            </dd>
                            <dt className="text-muted-foreground">
                                As a copy grows
                            </dt>
                            <dd className="text-pretty">{direction.grows}</dd>
                            <dt className="text-muted-foreground">
                                Trade-offs
                            </dt>
                            <dd className="text-pretty">
                                {direction.tradeoffs}
                            </dd>
                        </dl>
                    </li>
                ))}
            </ol>

            <section className="flex flex-col gap-4 rounded-xl bg-muted px-5 py-5 sm:px-6">
                <h2 className="font-heading font-semibold text-xl tracking-tight">
                    My pick: A, the rail
                </h2>
                <p className="max-w-[62ch] text-pretty leading-relaxed">
                    Foundation is a starting point, so the dashboard's job is to
                    be the shape a copy grows into, and a rail with a page per
                    feature is that shape: the next feature is one more stop,
                    which is what the home page promises. It keeps what matters
                    from the other two: runs arrive live, as B's do, and a run
                    opens in place to its steps and its error, as C's detail
                    does. If watching it live is the point, B is the one to
                    pick; if most copies will be lists of records, C.
                </p>
            </section>

            <section className="flex flex-col gap-5">
                <h2 className="font-heading font-semibold text-xl tracking-tight">
                    For the build, in any direction
                </h2>
                <dl className="flex flex-col gap-5">
                    {QUESTIONS.map((each) => (
                        <div
                            key={each.question}
                            className="flex flex-col gap-1.5"
                        >
                            <dt className="font-medium">{each.question}</dt>
                            <dd className="max-w-[62ch] text-pretty text-muted-foreground leading-relaxed">
                                {each.answer}
                            </dd>
                        </div>
                    ))}
                </dl>
                <p className="max-w-[62ch] text-pretty text-muted-foreground leading-relaxed">
                    The workflows screen reads runs through DBOS's own functions
                    for listing workflows and their steps, never its tables, and
                    asks again every two seconds while it's open. Trying a
                    failed run again is DBOS's resume, which starts from the
                    step that failed.
                </p>
            </section>
        </main>
    )
}
