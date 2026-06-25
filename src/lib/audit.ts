import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'

// Stable action codes for the account audit trail (Wave 2A.5 §B.4).
export type AuditAction =
  | 'RESET_PIN'
  | 'UNLOCK_PIN'
  | 'SUSPEND'
  | 'REACTIVATE'
  | 'FORCE_LOGOUT'
  | 'ROLE_CHANGE'
  | 'SET_DEFAULTS'
  | 'INVITE_SENT'
  | 'INVITE_RESENT'
  | 'INVITE_REVOKED'
  | 'BULK_IMPORT'
  | 'DEPLOYMENT_HANDOFF'

/**
 * Append an entry to the account audit log. Best-effort: a logging failure
 * never blocks the underlying action (it's logged to the server console).
 */
export async function writeAudit(
  actorId: string,
  action: AuditAction,
  targetUserId: string | null,
  metadata?: Record<string, unknown>,
): Promise<void> {
  try {
    await prisma.accountAuditLog.create({
      data: {
        actorId,
        action,
        targetUserId: targetUserId ?? undefined,
        metadata: metadata ? (metadata as Prisma.InputJsonValue) : undefined,
      },
    })
  } catch (err) {
    console.error('[audit] failed to write', action, err)
  }
}
