import { useMutation } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { useEffect } from "react"
import { Button } from "@/frontend/components/primitives/button"
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

/**
 * Where customers and staff sign in, and where the email's link lands, as
 * /sign-in#<token>. The token rides in the fragment, which a browser never
 * sends to a server, so the page stays prerendered and a mail scanner that
 * opens the link can't spend it: only this page's script does, by posting
 * it to the API. The screens behind sign-in will go under /dashboard.
 */
function SignInPage() {
    const session = useSession()
    const link = useMutation(verifySignIn)
    const leave = useMutation(signOut)

    // Spends the link's token, as the page loads, and when a link is opened
    // in a tab that's already here
    useEffect(() => {
        function redeem() {
            const token = window.location.hash.slice(1)
            if (token === "") {
                return
            }
            // Out of the address bar and the history, so it isn't shared or
            // bookmarked by mistake
            window.history.replaceState(null, "", window.location.pathname)
            link.mutate({ token })
        }
        redeem()
        window.addEventListener("hashchange", redeem)
        return () => window.removeEventListener("hashchange", redeem)
    }, [link.mutate])

    return (
        <main className="mx-auto flex min-h-screen max-w-md flex-col gap-10 px-5 py-6 sm:py-10">
            <header>
                <Link
                    to="/"
                    className="flex w-fit items-center gap-2.5 rounded-sm focus-visible:outline-2 focus-visible:outline-ring"
                >
                    <img src="/favicon.svg" alt="" className="size-5" />
                    <span className="font-medium text-sm">Your business</span>
                </Link>
            </header>

            <section className="flex flex-col gap-6 sm:mt-10">
                {link.isPending ? (
                    <p role="status" className="text-muted-foreground">
                        Signing you in…
                    </p>
                ) : session.status === "signed-in" ? (
                    <>
                        <div className="flex flex-col gap-2">
                            <h1 className="text-balance font-heading font-semibold text-3xl tracking-tight">
                                You're signed in.
                            </h1>
                            <p className="text-muted-foreground">
                                As{" "}
                                <span className="font-medium text-foreground">
                                    {session.user.email}
                                </span>
                                .
                            </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-3">
                            <Button
                                variant="outline"
                                disabled={leave.isPending}
                                onClick={() => leave.mutate()}
                                className="h-10 px-4"
                            >
                                {leave.isPending ? "Signing out…" : "Sign out"}
                            </Button>
                            <Link
                                to="/"
                                className="text-sm underline decoration-foreground/40 underline-offset-4 hover:decoration-foreground"
                            >
                                Back to the home page
                            </Link>
                        </div>
                    </>
                ) : (
                    <>
                        <div className="flex flex-col gap-2">
                            <h1 className="text-balance font-heading font-semibold text-3xl tracking-tight">
                                Sign in
                            </h1>
                            {link.error === null ? (
                                <p className="text-pretty text-muted-foreground leading-relaxed">
                                    Enter your email and we'll send you a code
                                    and a link. There's no password.
                                </p>
                            ) : (
                                <p
                                    role="alert"
                                    className="text-pretty text-destructive leading-relaxed"
                                >
                                    {whatWentWrong(failureOf(link.error))}
                                </p>
                            )}
                        </div>
                        <SignInForm />
                    </>
                )}
            </section>
        </main>
    )
}
