import { AppShell } from '@/components/ui/AppShell'
import { AdminNav } from '@/components/admin/AdminNav'
import { ToastProvider } from '@/components/shared/useToast'
import { getSession } from '@/lib/auth/session'
import { redirect } from 'next/navigation'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') redirect('/login')
  return (
    <AppShell nav={<AdminNav />} title="AHITS Admin">
      <ToastProvider>{children}</ToastProvider>
    </AppShell>
  )
}
