// The shape every function that can fail in an expected, recoverable way
// returns. `throw` stays reserved for the genuinely unexpected -- bugs,
// unreachable states, infrastructure -- so a caller holding one of these
// knows the failure is one it is meant to handle.
//
// `Err` is deliberately required rather than defaulting to `string`: an
// untyped error narrows to nothing and can never be checked for
// exhaustiveness. Naming the failure is the entire point of the shape -- a
// literal union where the outcome is the whole story, a structured object
// where it carries context. (`Err`, not `Error`, so it doesn't shadow the
// global `Error` class.)
export type OperationResult<Data, Err> =
    | { ok: true; data: Data }
    | { ok: false; error: Err }

// The async form. Synchronous helpers use `OperationResult` directly --
// reach for this only when the function is genuinely async.
export type AsyncOperation<Data, Err> = Promise<OperationResult<Data, Err>>
