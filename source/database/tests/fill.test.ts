import { expect, test } from "vitest"
import { testDatabase } from "./support/database"
import { fill } from "./support/fill"

// The upgrade test's sample rows on checks the template's own tables don't
// have, but a copy's may, as Skyline's appointments and notes do: one column
// after another, and at least one of several set. A row that broke either
// would fail its insert, and fill() with it.

test("fill() meets a check for one column after another, and one for at least one of several", async () => {
    const database = await testDatabase()
    const client = await database.$client.connect()
    try {
        await client.query(`
            create table contacts (
                id uuid primary key default gen_random_uuid(),
                name text not null
            );
            create table appointments (
                id uuid primary key default gen_random_uuid(),
                starts_at timestamptz not null,
                ends_at timestamptz not null,
                check (ends_at > starts_at)
            );
            create table notes (
                id uuid primary key default gen_random_uuid(),
                contact_id uuid references contacts (id),
                appointment_id uuid references appointments (id),
                body text not null,
                check (num_nonnulls(contact_id, appointment_id) >= 1)
            )
        `)

        const filled = await fill(client)
        expect(filled.appointments).toBe(3)
        expect(filled.notes).toBe(3)
    } finally {
        client.release()
    }
})
