import { Collapsible as CollapsiblePrimitive } from "@base-ui/react/collapsible"
import { cn } from "cn"

function Collapsible({ ...props }: CollapsiblePrimitive.Root.Props) {
    return <CollapsiblePrimitive.Root data-slot="collapsible" {...props} />
}

function CollapsibleTrigger({ ...props }: CollapsiblePrimitive.Trigger.Props) {
    return (
        <CollapsiblePrimitive.Trigger
            data-slot="collapsible-trigger"
            {...props}
        />
    )
}

// Ours, not shadcn's: it opens and closes by growing and shrinking to its
// content's height (Base UI measures it into --collapsible-panel-height),
// over 150ms, and at once for anyone who asks for less motion. Clipped
// while it moves, so give what's inside room for its focus rings.
function CollapsibleContent({
    className,
    ...props
}: CollapsiblePrimitive.Panel.Props) {
    return (
        <CollapsiblePrimitive.Panel
            data-slot="collapsible-content"
            className={cn(
                "h-(--collapsible-panel-height) overflow-hidden transition-[height] duration-150 ease-out data-starting-style:h-0 data-ending-style:h-0 motion-reduce:transition-none",
                className
            )}
            {...props}
        />
    )
}

export { Collapsible, CollapsibleContent, CollapsibleTrigger }
