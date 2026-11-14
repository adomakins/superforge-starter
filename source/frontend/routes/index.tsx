import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { cn } from "cn"
import { healthQuery } from "@/frontend/queries/health"

export const Route = createFileRoute("/")({
    component: Home
})

// What's in the codebase, one line each. START-HERE.md replaces this page
// with the business's own.
const PARTS = [
    {
        name: "Website",
        detail: "TanStack Start, every page prerendered, built from shadcn's components"
    },
    {
        name: "API",
        detail: "Hono under /api, called through a typed client and TanStack Query"
    },
    {
        name: "Database",
        detail: "Postgres with Drizzle, every migration checked before it ships"
    },
    {
        name: "Deploys",
        detail: "Railway, from each merge to main, once CI has passed"
    },
    {
        name: "Tests",
        detail: "Vitest on a real Postgres, with a database of each test's own"
    }
] as const

function Home() {
    return (
        <main className="mx-auto flex min-h-screen max-w-3xl flex-col px-6 py-10 sm:py-16">
            <header className="flex items-center gap-2.5">
                <span aria-hidden className="size-5 rounded-md bg-foreground" />
                <span className="font-medium text-sm">Your business</span>
            </header>

            <section className="flex flex-1 flex-col justify-center gap-8 py-16">
                <p className="font-mono text-muted-foreground text-xs uppercase tracking-widest">
                    Hello, world
                </p>
                <h1 className="max-w-xl text-balance font-semibold text-4xl leading-[1.05] tracking-tight sm:text-6xl">
                    Your business, in one codebase.
                </h1>
                <p className="max-w-lg text-pretty text-lg text-muted-foreground leading-relaxed">
                    A website, an API and a database, in one repository you own.
                    Open{" "}
                    <code className="whitespace-nowrap rounded bg-muted px-1.5 py-0.5 font-mono text-foreground text-sm">
                        START-HERE.md
                    </code>{" "}
                    with Claude to make it yours: your name, your colors, your
                    words.
                </p>
                <Status />
            </section>

            <ul className="grid gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-2">
                {PARTS.map((part) => (
                    <li
                        key={part.name}
                        className="flex flex-col gap-1 bg-background p-5 last:sm:col-span-2"
                    >
                        <span className="font-medium text-sm">{part.name}</span>
                        <span className="text-muted-foreground text-sm">
                            {part.detail}
                        </span>
                    </li>
                ))}
            </ul>
        </main>
    )
}

// Whether the server and its database answer, asked from the browser, since
// the page itself is prerendered and served before the server runs
function Status() {
    const health = useQuery(healthQuery)
    const state = health.isPending
        ? { label: "Checking the server…", tone: "bg-muted-foreground" }
        : health.data === true
          ? { label: "Server and database are up", tone: "bg-success" }
          : {
                label: "The server can't reach its database",
                tone: "bg-destructive"
            }
    return (
        <p
            role="status"
            className="flex items-center gap-2 text-muted-foreground text-sm"
        >
            <span
                aria-hidden
                className={cn("size-2 rounded-full", state.tone)}
            />
            {state.label}
        </p>
    )
}
