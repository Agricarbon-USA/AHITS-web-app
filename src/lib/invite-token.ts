import { createHash, randomBytes } from 'crypto'

// Invite tokens are capability secrets that mint accounts, so we store only a
// hash at rest (H2) — same posture as status-link tokens. The raw token lives
// only in the emailed setup URL; the DB column holds sha256(raw), so a DB leak
// can't be replayed to create accounts.

/** Cryptographically-random, URL-safe invite token (256 bits of entropy). */
export function generateInviteToken(): string {
  return randomBytes(32).toString('base64url')
}

/** sha256 hex of a raw token — what gets stored and compared against. */
export function hashInviteToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex')
}
