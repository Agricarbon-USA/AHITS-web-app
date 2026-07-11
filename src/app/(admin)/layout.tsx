import { AppShell } from '@/components/ui/AppShell'
import { AdminNav } from '@/components/admin/AdminNav'
import { NotificationBell } from '@/components/shared/NotificationBell'
import { ToastProvider } from '@/components/shared/useToast'
import { ReadOnlyProvider } from '@/components/shared/ReadOnly'
import { OfflineBanner } from '@/components/operator/OfflineBanner'
import { getSessionClaims } from '@/lib/auth/session'
import { redirect } from 'next/navigation'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Option A (UR-007/026): verify the JWT locally (no DB) so the shell renders
  // offline. `canEdit` here is presentational only — every mutating admin API
  // route still calls requireAdmin() (DB-backed), so a demoted/ revoked user sees
  // the shell from their token but cannot actually mutate.
  const session = await getSessionClaims()
  // Admins get full access; operators are admitted READ-ONLY (workplan §6) and
  // restricted to the OPERATOR_VIEW_ADMIN_PATHS subset by proxy.ts. Any other
  // session is bounced to login.
  if (!session || (session.role !== 'ADMIN' && session.role !== 'OPERATOR')) redirect('/login')
  const canEdit = session.role === 'ADMIN'
  return (
    <AppShell nav={<AdminNav />} title={canEdit ? 'AHITS Admin' : 'AHITS'} headerActions={<NotificationBell />}>
      <ToastProvider>
        <OfflineBanner />
        <ReadOnlyProvider canEdit={canEdit}>{children}</ReadOnlyProvider>
      </ToastProvider>
    </AppShell>
  )
}
