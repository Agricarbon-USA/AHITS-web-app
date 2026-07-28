// Shared error strings that BOTH a server route and the offline-queue client must
// agree on. Kept in this dependency-free module (no prisma, no next/server) so the
// client bundle can import the constant without pulling server-only code.
//
// CC-29 item 6b: withIdempotency returns a 409 with this leading text when a
// concurrent replay is still in flight (a TRANSIENT conflict — the original
// write is mid-commit). The offline queue treats a 409 as terminal by default
// (TERMINAL_STATUSES), but a 409 whose body starts with this constant is the one
// 409 that must stay RETRYABLE — otherwise the losing half of a concurrent flush
// marks an applied write "Failed" and the operator redoes it (the duplicate-write
// vector). The coupling is the price of body-sniffing; a single shared constant is
// the mitigation. A stale client that doesn't know the constant just keeps the
// safe (at-worst-noisy) terminal behavior.
export const IDEMPOTENCY_IN_FLIGHT_ERROR = 'Request in flight'
