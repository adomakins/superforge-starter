import { cn } from "cn"
import { ArrowUpRight } from "lucide-react"

const DOCS = [
    { path: "README.md", what: "what's in it, and how to run it" },
    { path: "CLAUDE.md", what: "what Claude reads before every change" },
    { path: "workbench/", what: "writing code, shipping, reading the web" }
] as const

/** Where the docs are, and where the codebase came from. */
export function Footer({ className }: { className?: string }) {
    return (
        <footer
            className={cn(
                "flex flex-col gap-4 border-t pt-6 text-muted-foreground text-sm sm:flex-row sm:items-start sm:justify-between",
                className
            )}
        >
            <ul className="flex flex-col gap-1.5">
                {DOCS.map((doc) => (
                    <li key={doc.path}>
                        <code className="font-mono text-foreground text-xs">
                            {doc.path}
                        </code>{" "}
                        <span>{doc.what}</span>
                    </li>
                ))}
            </ul>
            <a
                href="https://github.com/superforge-studio/starter-template"
                className="inline-flex shrink-0 items-center gap-1 underline-offset-4 hover:text-foreground hover:underline"
            >
                Superforge Foundation
                <ArrowUpRight aria-hidden className="size-3.5" />
            </a>
        </footer>
    )
}
