import { createFileRoute, Link } from "@tanstack/react-router"
import { ArrowRight } from "lucide-react"

export const Route = createFileRoute("/mockups/")({
    component: Notes
})

// The notes beside the three mockups: each direction's idea, how it holds
// up restyled, what survives START-HERE's step 3, and its trade-offs

const DIRECTIONS = [
    {
        to: "/mockups/manifest",
        letter: "A",
        name: "Manifest",
        idea: "What's in the box as a packing list: each part, what it's for in plain words, where it lives, and a last column the page checks off live from the one health check (the API's measured round trip, the database connected). The planned parts sit underneath as planned, not as promises.",
        restyled:
            "Safest. It's text on the background with hairlines, so any theme reads well, but the business's color only lands on the Copy button: after step 2 the owner barely sees their brand arrive.",
        survives:
            "Maps one to one onto the dashboard's System panel: the same rows, with Sign-in and Workflows getting live checks of their own once they exist.",
        tradeoffs:
            "The clearest answer to “what have I got?”, and the least memorable. It reads like a settings table, and says nothing about how the parts connect."
    },
    {
        to: "/mockups/tree",
        letter: "B",
        name: "Tree",
        idea: "The page is the codebase: an annotated tour of the files worth knowing, with the one drawing this page marked “You are here”, START-HERE marked “Read first”, health.ts answering live in place, and each file opening to say what it's for and what to ask Claude to change it.",
        restyled:
            "Barely changes: the tree is mostly monospace names on a card. The serif and navy theme shows in the headline and one badge.",
        survives:
            "Weakest after-life: the owner's editor and Claude already show the files. It would live on only as a dev-only /start.",
        tradeoffs:
            "Best at “where do I edit?”, and honest about ownership. But it's the most developer-shaped of the three, the one most likely to intimidate an owner who doesn't code, and a hand-written tour goes stale as files move (TASK-1689 already moves health.ts)."
    },
    {
        to: "/mockups/line",
        letter: "C",
        name: "Line map",
        idea: "The app as a transit line, a stop for each part: you, the website, the API with Storage on a branch, the database. On load, the real health check runs the line as a pulse, and each stop shows what it found once the pulse arrives. The parts still to come are stops under construction, on a dashed line. Next stops, beside it: make it yours, build what it needs, put it online.",
        restyled:
            "Shows it off: the line is drawn in the main color, so after step 2 the owner sees their color run through their own app. Radius and heading font carry through the stops and badges.",
        survives:
            "Becomes the dashboard's System view, where the dashed stops go solid as Sign-in and Workflows land, each with its own check. Until then, a dev-only /start.",
        tradeoffs:
            "Answers what you've got, how it fits, and that it works, in one picture, and it's the one an owner would describe an hour later. It's the most code, its pulse has to stay honest (it waits for the real answer, with a floor of under a second so it can be seen), and it simplifies: the line reads as layers, not every hop."
    }
] as const

function Notes() {
    return (
        <main className="mx-auto flex max-w-3xl flex-col gap-12 px-5 py-8 sm:px-8 sm:py-12">
            <section className="flex flex-col gap-4">
                <h1 className="text-balance font-heading font-semibold text-3xl tracking-tight">
                    Foundation's home page, three directions
                </h1>
                <p className="max-w-[62ch] text-pretty text-muted-foreground leading-relaxed">
                    The page a new owner sees first, in the browser pane beside
                    Claude, before START-HERE asks anything. Each direction is a
                    real route on this dev server, drawn only in shadcn's
                    tokens, with the real health check. The bar at the bottom
                    switches between them, and between two made-up businesses'
                    themes, set the way START-HERE's step 2 sets them.
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
                                search={(previous) => previous}
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
                            <dt className="text-muted-foreground">Restyled</dt>
                            <dd className="text-pretty">
                                {direction.restyled}
                            </dd>
                            <dt className="text-muted-foreground">
                                After step 3
                            </dt>
                            <dd className="text-pretty">
                                {direction.survives}
                            </dd>
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
                    My pick: C, the line map
                </h2>
                <p className="max-w-[62ch] text-pretty leading-relaxed">
                    The first-run moment needs proof and a picture more than a
                    table. During onboarding the owner is already in START-HERE,
                    so “say start here” matters less than seeing that it all
                    runs and what it's made of. The line does both, it's the
                    only direction where the owner's own color visibly arrives
                    after step 2, and its dashed stops make the roadmap legible
                    without a “coming soon” list. A's rows are the better shape
                    for the dashboard's System panel later; B's “You are here”
                    is worth keeping as one line on C.
                </p>
            </section>

            <section className="flex flex-col gap-3">
                <h2 className="font-heading font-semibold text-xl tracking-tight">
                    What survives START-HERE's step 3, in any direction
                </h2>
                <p className="max-w-[62ch] text-pretty text-muted-foreground leading-relaxed">
                    The page moves to{" "}
                    <code className="font-mono text-foreground text-sm">
                        /start
                    </code>
                    , dev-only: the prerender's filter in vite.config.ts leaves
                    it out (Start's prerender writes every route without
                    parameters, linked or not), and outside{" "}
                    <code className="font-mono text-foreground text-sm">
                        pnpm dev
                    </code>{" "}
                    it answers 404. Step 3 then replaces only the home page, and
                    a small dev-only link in the corner of every page (like
                    Superforge's “Preview as” switcher) leads back to it. Once
                    the dashboard exists, it becomes the dashboard's System
                    panel instead.
                </p>
            </section>
        </main>
    )
}
