import { cn } from "cn"
import { Check, Copy } from "lucide-react"
import { useEffect, useId, useState } from "react"
import { Button } from "@/frontend/components/primitives/button"

// Copies a prompt to the clipboard, and says so for a moment
function useCopy(text: string) {
    const [copied, setCopied] = useState(false)

    useEffect(() => {
        if (!copied) {
            return
        }
        const timer = setTimeout(() => setCopied(false), 1600)
        return () => clearTimeout(timer)
    }, [copied])

    async function copy() {
        try {
            await navigator.clipboard.writeText(text)
            setCopied(true)
        } catch (error) {
            console.warn("Copying the prompt failed", { error })
        }
    }

    return { copied, copy }
}

/**
 * The page's main action: what to say to Claude next, as it would sit in the
 * chat, with a button that copies it. The words are the instruction; the
 * copy is only a convenience.
 */
export function SayToClaude({
    prompt,
    label = "Say this to Claude",
    detail,
    className
}: {
    prompt: string
    label?: string
    detail?: string
    className?: string
}) {
    const { copied, copy } = useCopy(prompt)
    const promptId = useId()
    return (
        <div className={cn("flex flex-col gap-2", className)}>
            <p className="font-medium text-sm">{label}</p>
            <div className="flex items-center gap-2 rounded-xl border bg-card p-1.5 pl-4 shadow-xs">
                <p
                    id={promptId}
                    className="min-w-0 flex-1 truncate font-medium text-base"
                >
                    {prompt}
                </p>
                <Button
                    onClick={copy}
                    aria-describedby={promptId}
                    className="min-w-20"
                >
                    {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
                    {copied ? "Copied" : "Copy"}
                </Button>
            </div>
            {detail !== undefined && (
                <p className="max-w-[60ch] text-pretty text-muted-foreground text-sm">
                    {detail}
                </p>
            )}
        </div>
    )
}

/** A smaller prompt: a suggestion that copies itself when it's clicked. */
export function PromptChip({
    prompt,
    className
}: {
    prompt: string
    className?: string
}) {
    const { copied, copy } = useCopy(prompt)
    return (
        <button
            type="button"
            onClick={copy}
            className={cn(
                "group/chip inline-flex max-w-full items-center gap-2 rounded-lg border bg-background px-3 py-1.5 text-left text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                className
            )}
        >
            <span className="min-w-0 text-pretty">“{prompt}”</span>
            <span className="flex shrink-0 items-center gap-1 text-muted-foreground text-xs group-hover/chip:text-foreground">
                {copied ? (
                    <Check aria-hidden className="size-3.5" />
                ) : (
                    <Copy aria-hidden className="size-3.5" />
                )}
                <span className={cn(!copied && "sr-only")}>
                    {copied ? "Copied" : "Copy"}
                </span>
            </span>
        </button>
    )
}
