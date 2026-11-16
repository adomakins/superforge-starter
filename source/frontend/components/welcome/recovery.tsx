import { cn } from "cn"
import { z } from "zod"
import { IN_DEVELOPMENT } from "./environment"
import type { Finding } from "./finding"
import { PromptChip } from "./prompt-chip"

/**
 * What to do when the health check failed: which part failed, so the page
 * can say it under that part, what went wrong, the sentence to tell Claude,
 * and what else would fix it. A dev server and a build differ.
 */
export const recovery = z.object({
    part: z.enum(["api", "database"]),
    problem: z.string(),
    prompt: z.string(),
    otherwise: z.string()
})
export type Recovery = z.infer<typeof recovery>

export function recoveryFor(found: Finding): Recovery | null {
    switch (found.state) {
        case "checking":
        case "up":
            return null
        case "database-down":
            return {
                part: "database",
                problem: "The database isn't answering.",
                prompt: IN_DEVELOPMENT
                    ? "The database is down"
                    : "The database is down on Railway",
                otherwise: IN_DEVELOPMENT
                    ? "Or restart the dev server: stop it, then run pnpm dev, which starts the database too."
                    : "Or look in Railway's dashboard, which shows whether Postgres is running."
            }
        case "api-down":
            return {
                part: "api",
                problem: "The server didn't answer.",
                prompt: IN_DEVELOPMENT
                    ? "The dev server stopped"
                    : "The site is down on Railway",
                otherwise: IN_DEVELOPMENT
                    ? "Or start it again yourself with pnpm dev."
                    : "Or look in Railway's deploy logs, which say why."
            }
    }
}

/** What went wrong and how to fix it, to sit under the part that failed. */
export function RecoveryNote({
    recovery,
    className
}: {
    recovery: Recovery
    className?: string
}) {
    return (
        <div
            role="alert"
            className={cn(
                "flex flex-col gap-2 rounded-lg bg-destructive/10 px-4 py-3 text-sm",
                className
            )}
        >
            <p className="font-medium text-destructive">{recovery.problem}</p>
            <p className="flex flex-wrap items-center gap-2">
                <span>Tell Claude</span>
                <PromptChip prompt={recovery.prompt} />
            </p>
            <p className="text-pretty text-muted-foreground text-xs">
                {recovery.otherwise}
            </p>
        </div>
    )
}
