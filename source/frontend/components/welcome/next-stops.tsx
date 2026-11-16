import { cn } from "cn"
import { PromptChip } from "./prompt-chip"

// What to do next, in order, each with the sentence that starts it
const STOPS = [
    {
        title: "Make it yours",
        body: "Claude asks about your business, then sets your colors, fonts and words, and replaces this page with yours.",
        prompt: "start here"
    },
    {
        title: "Build what it needs",
        body: "Each new part runs on this line: a table in the database, routes in the API, a page on the website.",
        prompt: "Keep a list of our customers"
    },
    {
        title: "Put it online",
        body: "Railway, set up once from workbench/commit-and-deploy.md. After that, each change you merge goes live once its checks pass.",
        prompt: "Put it online"
    }
] as const

/** The next stops: make it yours, build what it needs, put it online. */
export function NextStops({ className }: { className?: string }) {
    return (
        <aside
            aria-labelledby="next-stops"
            className={cn("flex flex-col gap-5", className)}
        >
            <h2
                id="next-stops"
                className="font-heading font-semibold text-lg tracking-tight"
            >
                Next stops
            </h2>
            <ol className="flex flex-col gap-6">
                {STOPS.map((stop, index) => (
                    <li
                        key={stop.title}
                        className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-x-3"
                    >
                        <span
                            aria-hidden
                            className="flex size-7 items-center justify-center rounded-full bg-primary font-semibold text-primary-foreground text-sm tabular-nums"
                        >
                            {index + 1}
                        </span>
                        <div className="flex flex-col gap-2 pt-0.5">
                            <h3 className="font-medium">{stop.title}</h3>
                            <p className="text-pretty text-muted-foreground text-sm">
                                {stop.body}
                            </p>
                            <PromptChip
                                prompt={stop.prompt}
                                className="w-fit"
                            />
                        </div>
                    </li>
                ))}
            </ol>
        </aside>
    )
}
