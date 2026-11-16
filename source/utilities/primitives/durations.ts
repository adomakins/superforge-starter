// Lengths of time in milliseconds, what `Date.now()`, `setTimeout` and DBOS
// count in, so a duration reads as what it is: `7 * DAY`, not `604800000`.

export const SECOND = 1000
export const MINUTE = 60 * SECOND
export const HOUR = 60 * MINUTE
export const DAY = 24 * HOUR
export const WEEK = 7 * DAY
