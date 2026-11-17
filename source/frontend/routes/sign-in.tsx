import { useMutation } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { Button, buttonVariants } from "@/frontend/components/primitives/button"
import { BusinessMark } from "@/frontend/components/site/business-mark"
import {
    SignInForm,
    whatWentWrong
} from "@/frontend/components/site/sign-in-form"
import { signOut, useSession, verifySignIn } from "@/frontend/queries/auth"
import { failureOf } from "@/frontend/queries/failures"

export const Route = createFileRoute("/sign-in")({
    head: () => ({
        meta: [{ title: "Sign in" }, { name: "robots", content: "noindex" }]
    }),
    component: SignInPage
})

const heading =
    "text-balance font-heading font-semibold text-3xl tracking-tight"

/**
 * Where customers and staff sign in, and where the email's link lands, as
 * /sign-in#<token>. The token rides in the fragment, which a browser never
 * sends to a server, so the page stays prerendered. It's spent only when
 * the visitor presses "Finish signing in", never as the page loads: a mail
 * scanner that opens the link, even one that runs the page's script, spends
 * nothing, and a link someone else sent can't sign this browser in without
 * a press. Once someone's in, the screens behind sign-in are under
 * /dashboard (routes/dashboard/).
 */
function SignInPage() {
    const session = useSession()
    const link = useMutation(verifySignIn)
    const leave = useMutation(signOut)
    // A link's token, waiting for the visitor to finish signing in with it
    const [token, setToken] = useState<string | null>(null)

    // Takes the link's token, as the page loads and when a link is opened in
    // a tab that's already here
    useEffect(() => {
        function take() {
            const found = window.location.hash.slice(1)
            if (found === "") {
                return
            }
            // Out of the address bar and the history, so it isn't shared or
            // bookmarked by mistake
            window.history.replaceState(null, "", window.location.pathname)
            link.reset()
            setToken(found)
        }
        take()
        window.addEventListener("hashchange", take)
        return () => window.removeEventListener("hashchange", take)
    }, [link.reset])

    function finish(waiting: string) {
        link.mutate({ token: waiting }, { onSettled: () => setToken(null) })
    }

    const problem =
        link.error !== null
            ? whatWentWrong(failureOf(link.error))
            : leave.error !== null
              ? "That didn't sign you out. Try again in a moment."
              : null

    return (
        <main className="mx-auto flex min-h-screen max-w-md flex-col gap-10 px-5 py-6 sm:py-10">
            <header>
                <BusinessMark />
            </header>

            <section className="flex flex-col gap-6 sm:mt-10">
                {token !== null ? (
                    <>
                        <div className="flex flex-col gap-2">
                            <h1 className={heading}>Finish signing in</h1>
                            <p className="text-pretty text-muted-foreground leading-relaxed">
                                You opened the link from your sign-in email.
                                Finish here to sign in on this browser.
                            </p>
                        </div>
                        <Button
                            disabled={link.isPending}
                            onClick={() => finish(token)}
                            className="h-10 w-fit px-4"
                        >
                            {link.isPending
                                ? "Signing in…"
                                : "Finish signing in"}
                        </Button>
                    </>
                ) : session.status === "signed-in" ? (
                    <>
                        <div className="flex flex-col gap-2">
                            <h1 className={heading}>You're signed in.</h1>
                            <p className="text-muted-foreground">
                                As{" "}
                                <span className="font-medium text-foreground">
                                    {session.user.email}
                                </span>
                                .
                            </p>
                        </div>
                        <Problem text={problem} />
                        <div className="flex flex-wrap items-center gap-3">
                            <Link
                                to="/dashboard"
                                className={buttonVariants({
                                    className: "h-10 px-4"
                                })}
                            >
                                Go to your dashboard
                            </Link>
                            <Button
                                variant="outline"
                                disabled={leave.isPending}
                                onClick={() => leave.mutate()}
                                className="h-10 px-4"
                            >
                                {leave.isPending ? "Signing out…" : "Sign out"}
                            </Button>
                        </div>
                    </>
                ) : (
                    <>
                        <div className="flex flex-col gap-2">
                            <h1 className={heading}>Sign in</h1>
                            {problem === null ? (
                                <p className="text-pretty text-muted-foreground leading-relaxed">
                                    Enter your email and we'll send you a code
                                    and a link. There's no password.
                                </p>
                            ) : (
                                <Problem text={problem} />
                            )}
                        </div>
                        <SignInForm />
                    </>
                )}
            </section>
        </main>
    )
}

function Problem({ text }: { text: string | null }) {
    if (text === null) {
        return null
    } else {
        return (
            <p
                role="alert"
                className="text-pretty text-destructive leading-relaxed"
            >
                {text}
            </p>
        )
    }
}
