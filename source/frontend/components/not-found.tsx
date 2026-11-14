import { Link } from "@tanstack/react-router"

export function NotFound() {
    return (
        <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-4 px-6">
            <p className="text-muted-foreground text-sm">404</p>
            <h1 className="font-semibold text-3xl tracking-tight">
                There's nothing here.
            </h1>
            <Link to="/" className="text-sm underline underline-offset-4">
                Back to the home page
            </Link>
        </main>
    )
}
