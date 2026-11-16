import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { beforeEach, expect, test, vi } from "vitest"
import { chooseInfra } from "../choose"

// Which Infra a server calls, by what it runs as and the keys it has: a
// build only ever with a secret key, a dev server only ever with a test key
// or the stand-in

const SECRET_KEY = `sf_secret_${"A1".repeat(16)}`
const TEST_KEY = `sf_test_${"b2".repeat(16)}`

beforeEach(() => {
    vi.spyOn(console, "info").mockImplementation(() => {})
    vi.spyOn(console, "error").mockImplementation(() => {})
})

// A folder for a checkout of the test's own, with no `.env`
function emptyCheckout() {
    return mkdtempSync(join(tmpdir(), "app-infra-"))
}

function choose(
    development: boolean,
    environment: Record<string, string>,
    checkout = emptyCheckout()
) {
    return chooseInfra({ development, environment, checkout }).using
}

test("a build calls Infra with its secret key", () => {
    expect(choose(false, { INFRA_SECRET_KEY: SECRET_KEY })).toBe("secret key")
})

test("a build without a secret key calls nothing, rather than the stand-in", () => {
    expect(choose(false, {})).toBe("nothing")
    expect(choose(false, { INFRA_SECRET_KEY: TEST_KEY })).toBe("nothing")
    expect(choose(false, { INFRA_TEST_KEY: TEST_KEY })).toBe("nothing")
    expect(choose(false, { INFRA_SECRET_KEY: "sf_secret_short" })).toBe(
        "nothing"
    )
})

test("a dev server calls Infra with a test key, and never a secret one", () => {
    expect(choose(true, { INFRA_TEST_KEY: TEST_KEY })).toBe("test key")
    expect(choose(true, { INFRA_SECRET_KEY: SECRET_KEY })).toBe("stand-in")
    expect(choose(true, { INFRA_TEST_KEY: SECRET_KEY })).toBe("stand-in")
    expect(choose(true, {})).toBe("stand-in")
})

test("a dev server reads its test key from the checkout's .env", () => {
    const checkout = emptyCheckout()
    writeFileSync(join(checkout, ".env"), `INFRA_TEST_KEY=${TEST_KEY}\n`)
    expect(choose(true, {}, checkout)).toBe("test key")
})

test("a worktree with no .env of its own reads its main checkout's", () => {
    // A main checkout with a .env, and a worktree of it, as git lays them
    // out: the worktree's .git a file naming its folder in the main's .git
    const main = emptyCheckout()
    writeFileSync(join(main, ".env"), `INFRA_TEST_KEY="${TEST_KEY}"\n`)
    const worktree_git = join(main, ".git", "worktrees", "feature")
    mkdirSync(worktree_git, { recursive: true })
    writeFileSync(join(worktree_git, "commondir"), "../..\n")
    const worktree = join(main, ".claude", "worktrees", "feature")
    mkdirSync(worktree, { recursive: true })
    writeFileSync(join(worktree, ".git"), `gitdir: ${worktree_git}\n`)

    expect(choose(true, {}, worktree)).toBe("test key")
})

test("a variable set empty, as .env.example has them, is unset", () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {})
    expect(choose(true, { INFRA_TEST_KEY: "", INFRA_URL: "" })).toBe("stand-in")
    expect(logged).not.toHaveBeenCalled()
})

test("a variable that isn't set right calls nothing", () => {
    expect(
        choose(false, { INFRA_SECRET_KEY: SECRET_KEY, INFRA_URL: "not a url" })
    ).toBe("nothing")
})
