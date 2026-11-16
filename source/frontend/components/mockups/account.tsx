import { cn } from "cn"
import { LogOut, Monitor, Smartphone } from "lucide-react"
import { type SubmitEvent, useId, useState } from "react"
import { Button } from "@/frontend/components/primitives/button"
import { Input } from "@/frontend/components/primitives/input"
import { Label } from "@/frontend/components/primitives/label"
import { useNow } from "./marks"
import {
    moment,
    type Person,
    ROLE_NAMES,
    type Role,
    sampleSessions,
    since
} from "./sample-data"

// The account, the same in every direction: what a customer's whole
// dashboard is, and one screen of an internal user's. Their name, which they
// can change, the address they sign in with, and the browsers they're
// signed in on, with signing out of the others.

const sectionHeading = "font-heading font-semibold text-base tracking-tight"
const textButton =
    "font-medium text-foreground text-sm underline decoration-foreground/40 underline-offset-4 transition-colors hover:decoration-foreground focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50"

export function AccountPanel({
    who,
    className
}: {
    who: { name: string; email: string }
    className?: string
}) {
    return (
        <div className={cn("flex flex-col gap-10", className)}>
            <DetailsForm who={who} />
            <Sessions />
        </div>
    )
}

function DetailsForm({ who }: { who: { name: string; email: string } }) {
    const ids = useId()
    const [saved, setSaved] = useState(false)
    const [name, setName] = useState(who.name)

    function save(event: SubmitEvent<HTMLFormElement>) {
        event.preventDefault()
        setSaved(true)
    }

    return (
        <form onSubmit={save} className="flex flex-col gap-5">
            <h2 className={sectionHeading}>Your details</h2>
            <div className="flex flex-col gap-2">
                <Label htmlFor={`${ids}-name`}>Name</Label>
                <div className="flex flex-col gap-2 sm:flex-row">
                    <Input
                        id={`${ids}-name`}
                        value={name}
                        autoComplete="name"
                        onChange={(event) => {
                            setName(event.target.value)
                            setSaved(false)
                        }}
                        className="h-10 sm:max-w-sm"
                    />
                    <Button
                        type="submit"
                        variant="outline"
                        disabled={saved || name === "" || name === who.name}
                        className="h-10 px-4"
                    >
                        {saved ? "Saved" : "Save name"}
                    </Button>
                </div>
            </div>
            <div className="flex flex-col gap-1">
                <span className="font-medium text-sm">Sign-in email</span>
                <span className="text-sm">{who.email}</span>
                <span className="text-muted-foreground text-sm">
                    Your sign-in codes and links go here.
                </span>
            </div>
        </form>
    )
}

function Sessions() {
    const now = useNow()
    const [sessions, setSessions] = useState(sampleSessions)
    const others = sessions.filter((session) => !session.current)

    return (
        <section className="flex flex-col gap-4">
            <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
                <h2 className={sectionHeading}>Where you're signed in</h2>
                {others.length > 0 && (
                    <button
                        type="button"
                        className={textButton}
                        onClick={() =>
                            setSessions((all) =>
                                all.filter((session) => session.current)
                            )
                        }
                    >
                        Sign out everywhere else
                    </button>
                )}
            </div>
            <ul className="flex flex-col divide-y rounded-lg border">
                {sessions.map((session) => {
                    const Icon = session.device.includes("iPhone")
                        ? Smartphone
                        : Monitor
                    return (
                        <li
                            key={session.id}
                            className="flex items-center gap-3 px-4 py-3"
                        >
                            <Icon
                                aria-hidden
                                className="size-4 shrink-0 text-muted-foreground"
                            />
                            <div className="flex min-w-0 flex-1 flex-col">
                                <span className="text-sm">
                                    {session.device}
                                </span>
                                <span
                                    className="text-muted-foreground text-xs tabular-nums"
                                    title={moment(session.last_used)}
                                >
                                    {session.current
                                        ? "This browser"
                                        : `Last used ${since(session.last_used, now)}`}
                                    {" · "}
                                    signed in {since(session.started, now)}
                                </span>
                            </div>
                            {!session.current && (
                                <button
                                    type="button"
                                    className={textButton}
                                    onClick={() =>
                                        setSessions((all) =>
                                            all.filter(
                                                (each) => each.id !== session.id
                                            )
                                        )
                                    }
                                >
                                    Sign out
                                </button>
                            )}
                        </li>
                    )
                })}
            </ul>
            <Button variant="outline" className="h-10 w-fit px-4">
                <LogOut aria-hidden />
                Sign out of this browser
            </Button>
        </section>
    )
}

/**
 * Which role someone has, as two choices side by side: one of the
 * business's own, or a customer. You can't change your own.
 */
export function RoleSwitch({
    person,
    onChange,
    disabled = false
}: {
    person: Person
    onChange: (role: Role) => void
    disabled?: boolean
}) {
    const roles: Role[] = ["internal", "customer"]
    return (
        <fieldset
            disabled={disabled}
            className="inline-flex w-fit rounded-lg border bg-muted p-0.5 disabled:opacity-60"
        >
            <legend className="sr-only">Role</legend>
            {roles.map((role) => (
                <button
                    key={role}
                    type="button"
                    aria-pressed={person.role === role}
                    onClick={() => onChange(role)}
                    className="rounded-md px-2.5 py-1 font-medium text-muted-foreground text-xs transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring aria-pressed:bg-background aria-pressed:text-foreground aria-pressed:shadow-xs"
                >
                    {ROLE_NAMES[role]}
                </button>
            ))}
        </fieldset>
    )
}

/**
 * Removing someone, asked once more in place rather than in a dialog:
 * they lose access and their sessions end. They can sign in again, as
 * someone new.
 */
export function RemoveControl({
    person,
    onRemove,
    disabled = false
}: {
    person: Person
    onRemove: () => void
    disabled?: boolean
}) {
    const [asking, setAsking] = useState(false)
    if (disabled) {
        return null
    } else if (!asking) {
        return (
            <button
                type="button"
                className={cn(textButton, "text-muted-foreground")}
                onClick={() => setAsking(true)}
            >
                Remove
            </button>
        )
    } else {
        return (
            <span className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
                <span className="text-pretty">
                    Remove {person.name ?? person.email}? Their sessions end.
                </span>
                <Button
                    size="sm"
                    variant="destructive"
                    onClick={onRemove}
                    className="px-3"
                >
                    Remove
                </Button>
                <button
                    type="button"
                    className={textButton}
                    onClick={() => setAsking(false)}
                >
                    Keep
                </button>
            </span>
        )
    }
}

/** A role, as a quiet word beside a name. */
export function RoleWord({ role }: { role: Role }) {
    return (
        <span
            className={cn(
                "text-xs",
                role === "internal"
                    ? "font-medium text-foreground"
                    : "text-muted-foreground"
            )}
        >
            {ROLE_NAMES[role]}
        </span>
    )
}

/** The business's mark, as the home page shows it: the favicon and its name. */
export function BusinessMark({ className }: { className?: string }) {
    return (
        <span className={cn("flex items-center gap-2.5", className)}>
            <img src="/favicon.svg" alt="" className="size-5" />
            <span className="font-medium text-sm">Your business</span>
        </span>
    )
}
