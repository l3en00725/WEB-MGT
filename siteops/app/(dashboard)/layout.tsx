import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Sidebar from '@/components/dashboard/Sidebar'
import QueryProvider from '@/components/dashboard/QueryProvider'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return (
    <QueryProvider>
      <div className="flex h-screen bg-background overflow-hidden">
        <Sidebar userId={user.id} userEmail={user.email ?? ''} />
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </QueryProvider>
  )
}
