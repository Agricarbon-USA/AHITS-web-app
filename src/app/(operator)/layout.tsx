import { AppShell } from '@/components/ui/AppShell'
import { OperatorNav } from '@/components/operator/OperatorNav'
import { OperatorBottomNav } from '@/components/operator/OperatorBottomNav'
import { OfflineBanner } from '@/components/operator/OfflineBanner'
import { PinChangeGate } from '@/components/operator/PinChangeGate'
import { NotificationBell } from '@/components/shared/NotificationBell'
import { ToastProvider } from '@/components/shared/useToast'
import { getSessionClaims } from '@/lib/auth/session'
import { redirect } from 'next/navigation'

export default async function OperatorLayout({ children }: { children: React.ReactNode }) {
  // Option A (UR-007/026): the shell gate verifies the JWT locally (no DB) so a
  // valid token renders the app offline. Revocation/suspension authority stays in
  // the API routes (getSession, DB-backed) — a revoked user is rejected on their
  // next online action, not by a layout DB round-trip that fails closed offline.
  const session = await getSessionClaims()
  if (!session) redirect('/login')
  return (
    <AppShell nav={<OperatorNav />} title="AHITS Field" headerActions={<NotificationBell />} bottomNav={<OperatorBottomNav />}>
      <ToastProvider>
        <PinChangeGate />
        <OfflineBanner />
        {children}
      </ToastProvider>
    </AppShell>
  )
}
