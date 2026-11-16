import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { z } from "zod"
import { LiveNote, useNow } from "@/frontend/components/dashboard/marks"
import { RunDetailPane, RunList } from "@/frontend/components/dashboard/runs"
import {
    CouldNotLoad,
    ListLoading,
    Panes,
    sectionHeading
} from "@/frontend/components/dashboard/shell"
import { runsQuery } from "@/frontend/queries/workflows"

/**
 * The workflows' runs as they run: the list on the left, asked again every
 * couple of seconds while the screen is open, and the chosen run on the
 * right, by its id in the address (`?run=`), the first that needs a look
 * when none is.
 */
export const Route = createFileRoute("/dashboard/workflows")({
    validateSearch: z.object({
        run: z.string().optional().catch(undefined)
    }),
    head: () => ({ meta: [{ title: "Workflows · Dashboard" }] }),
    component: Workflows
})

function Workflows() {
    const { run } = Route.useSearch()
    const now = useNow(5000)
    const runs = useQuery(runsQuery)
    const list = runs.data ?? []
    const first =
        list.find(
            (each) => each.status === "failed" || each.status === "canceled"
        ) ?? list[0]
    const chosen = run ?? first?.id

    return (
        <Panes
            chosen={run !== undefined}
            list={
                <>
                    <div className="flex shrink-0 items-center justify-between gap-4 border-b px-4 py-3">
                        <h1 className={sectionHeading}>Workflows</h1>
                        {runs.isSuccess && (
                            <LiveNote updated={runs.dataUpdatedAt} />
                        )}
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto">
                        {runs.isPending ? (
                            <ListLoading />
                        ) : runs.isError && runs.data === undefined ? (
                            <CouldNotLoad
                                what="The runs"
                                onRetry={() => runs.refetch()}
                            />
                        ) : (
                            <RunList runs={list} chosen={chosen} now={now} />
                        )}
                    </div>
                </>
            }
            detail={
                chosen === undefined ? (
                    <p className="p-8 text-pretty text-muted-foreground text-sm">
                        {runs.isPending ? "" : "Choose a run to see its steps."}
                    </p>
                ) : (
                    <RunDetailPane key={chosen} id={chosen} />
                )
            }
        />
    )
}
