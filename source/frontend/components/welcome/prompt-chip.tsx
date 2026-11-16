import { cn } from "cn"
import { Check, Copy } from "lucide-react"
import { useEffect, useState } from "react"

/**
 * Something to say to Claude, which copies itself when it's clicked. The
 * words are the instruction; the copy is only a convenience, for pasting
 * into the chat beside the page.
 */
export function PromptChip({
    prompt,
    className
}: {
    prompt: string
    className?: string
}) {
    const [copied, setCopied] = useState(false)

    // Says "Copied" for a moment, then goes back to the icon alone
    useEffect(() => {
        if (!copied) {
            return
        }
        const timer = setTimeout(() => setCopied(false), 1600)
        return () => clearTimeout(timer)
    }, [copied])

    async function copy() {
        try {
            await navigator.clipboard.writeText(prompt)
            setCopied(true)
        } catch (error) {
            console.warn("Copying the prompt failed", { error })
        }
    }

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
                <span aria-live="polite" className={cn(!copied && "sr-only")}>
                    {copied ? "Copied" : "Copy"}
                </span>
            </span>
        </button>
    )
}
