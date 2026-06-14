import { AppShell } from '@/components/ui/AppShell'
import { OperatorNav } from '@/components/operator/OperatorNav'
import { getSession } from '@/lib/auth/session'
import { redirect } from 'next/navigation'

export default async function OperatorLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  if (!session) redirect('/login')
  return <AppShell nav={<OperatorNav />} title="AHITS Field">{children}</AppShell>
}
