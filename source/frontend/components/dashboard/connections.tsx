import { useMutation, useQuery } from "@tanstack/react-query"
import { Bot } from "lucide-react"
import {
    accountConnectionsQuery,
    endAgentConnection
} from "@/frontend/queries/agents"
import { failureOf } from "@/frontend/queries/failures"
import { useNow } from "./marks"
import { sectionHeading, textButton } from "./shell"
import { moment, since } from "./words"

// Where one of the business's own has let Claude in to the app's MCP, on
// their account page, with disconnecting each (backend/agents/). Claude
// connects from its own side, and they allow it on the app's Allow page,
// so there's nothing to set up here.

export function Connections() {
    const now = useNow()
    const connections = useQuery(accountConnectionsQuery)
    const end = useMutation(endAgentConnection)
    const list = connections.data ?? []

    return (
        <section className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
                <h2 className={sectionHeading}>Claude</h2>
                <p className="text-pretty text-muted-foreground text-sm">
                    Where you've let Claude in to work here as you. Ask Claude
                    to connect to this app, and it brings you here to allow it.
                </p>
            </div>
            {connections.isPending ? (
                <div
                    aria-hidden
                    className="h-16 animate-pulse rounded-lg bg-muted motion-reduce:animate-none"
                />
            ) : connections.isError ? (
                <p role="alert" className="text-destructive text-sm">
                    Your connections didn't load. Try again in a moment.
                </p>
            ) : list.length === 0 ? (
                <p className="rounded-lg border border-dashed px-4 py-3 text-muted-foreground text-sm">
                    Claude isn't connected yet.
                </p>
            ) : (
                <ul className="flex flex-col divide-y rounded-lg border">
                    {list.map((connection) => (
                        <li
                            key={connection.id}
                            className="flex items-center gap-3 px-4 py-3"
                        >
                            <Bot
                                aria-hidden
                                className="size-4 shrink-0 text-muted-foreground"
                            />
                            <div className="flex min-w-0 flex-1 flex-col">
                                <span className="text-sm">
                                    {connection.client_name}
                                    {connection.scopes.includes("act")
                                        ? ""
                                        : ", reading only"}
                                </span>
                                <span
                                    className="text-muted-foreground text-xs tabular-nums"
                                    title={`Connected ${moment(connection.created_at)}`}
                                >
                                    Last used{" "}
                                    {since(connection.last_used_at, now)}
                                    {" · "}
                                    connected{" "}
                                    {since(connection.created_at, now)}
                                </span>
                            </div>
                            <button
                                type="button"
                                className={textButton}
                                disabled={end.isPending}
                                onClick={() =>
                                    end.mutate({ connection_id: connection.id })
                                }
                            >
                                Disconnect
                            </button>
                        </li>
                    ))}
                </ul>
            )}
            {end.error !== null && (
                <p role="alert" className="text-destructive text-sm">
                    That didn't disconnect: {failureOf(end.error).message}. Try
                    again in a moment.
                </p>
            )}
        </section>
    )
}
