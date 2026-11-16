import { expect, test } from "vitest"
import { bucketConfiguration } from ".."

// The bucket's credentials, read from the environment Railway sets: every
// variable checked as it's read, and each one that's missing or wrong named

const ENVIRONMENT = {
    STORAGE_BUCKET: "storage-abc",
    STORAGE_ENDPOINT: "https://storage.railway.app",
    STORAGE_REGION: "auto",
    STORAGE_ACCESS_KEY_ID: "key",
    STORAGE_SECRET_ACCESS_KEY: "secret"
}

test("reads the bucket's credentials from its variables", () => {
    expect(bucketConfiguration(ENVIRONMENT)).toEqual({
        bucket: "storage-abc",
        endpoint: "https://storage.railway.app",
        region: "auto",
        access_key_id: "key",
        secret_access_key: "secret"
    })
})

test("names each variable that's missing or wrong", () => {
    expect(() =>
        bucketConfiguration({
            ...ENVIRONMENT,
            STORAGE_BUCKET: undefined,
            STORAGE_ENDPOINT: "not an address",
            STORAGE_SECRET_ACCESS_KEY: ""
        })
    ).toThrow(
        "these aren't set right: STORAGE_BUCKET, STORAGE_ENDPOINT, STORAGE_SECRET_ACCESS_KEY"
    )
})
