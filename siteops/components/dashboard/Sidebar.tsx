'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useQuery } from '@tanstack/react-query'

interface SidebarProps {
  userId: string
  userEmail: string
}

function NavItem({
  href,
  children,
  badge,
}: {
  href: string
  children: React.ReactNode
  badge?: number
}) {
  const pathname = usePathname()
  const isActive = pathname === href || pathname.startsWith(href + '/')

  return (
    <Link
      href={href}
      className={`flex items-center justify-between px-3 py-1.5 text-sm rounded-md transition-colors ${
        isActive
          ? 'bg-surface-hover text-text-primary font-medium'
          : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover'
      }`}
    >
      <span>{children}</span>
      {badge != null && badge > 0 && (
        <span className="ml-2 px-1.5 py-0.5 text-xs font-medium bg-accent text-white rounded-full">
          {badge}
        </span>
      )}
    </Link>
  )
}

export default function Sidebar({ userId, userEmail }: SidebarProps) {
  const router = useRouter()
  const supabase = createClient()

  // Fetch pending review count
  const { data: pendingCount } = useQuery({
    queryKey: ['pending-count'],
    queryFn: async () => {
      const { count } = await supabase
        .from('skill_results')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending')
      return count ?? 0
    },
    refetchInterval: 30000,
  })

  // Fetch sites for sidebar list
  const { data: sites } = useQuery({
    queryKey: ['sites-list'],
    queryFn: async () => {
      const { data } = await supabase
        .from('sites')
        .select('id, name, domain, status')
        .order('name')
      return data ?? []
    },
  })

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <aside className="w-[220px] flex-shrink-0 border-r border-border flex flex-col h-full bg-background">
      {/* Logo */}
      <div className="px-4 py-4 border-b border-border">
        <Link href="/dashboard" className="flex items-center gap-2">
          <span className="text-sm font-semibold text-text-primary tracking-tight">SiteOps</span>
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto py-3 px-2 space-y-6 scrollbar-thin">
        {/* Main nav */}
        <div className="space-y-0.5">
          <NavItem href="/dashboard">Overview</NavItem>
          <NavItem href="/dashboard/queue" badge={pendingCount}>Queue</NavItem>
          <NavItem href="/dashboard/skills">Skills</NavItem>
          <NavItem href="/dashboard/history">History</NavItem>
        </div>

        {/* Sites */}
        <div>
          <div className="px-3 mb-1 flex items-center justify-between">
            <span className="text-xs font-medium text-text-muted uppercase tracking-wider">Sites</span>
            <Link
              href="/dashboard/sites/new"
              className="text-xs text-text-muted hover:text-text-primary transition-colors"
              title="Add site"
            >
              +
            </Link>
          </div>
          <div className="space-y-0.5">
            {sites?.map((site) => (
              <Link
                key={site.id}
                href={`/dashboard/sites/${site.id}`}
                className="flex items-center gap-2 px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary hover:bg-surface-hover rounded-md transition-colors"
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                    site.status === 'active' ? 'bg-success' : 'bg-text-muted'
                  }`}
                />
                <span className="truncate">{site.name}</span>
              </Link>
            ))}
            {!sites?.length && (
              <Link
                href="/dashboard/sites/new"
                className="px-3 py-1.5 text-sm text-text-muted hover:text-text-primary transition-colors block"
              >
                Add your first site →
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* User footer */}
      <div className="border-t border-border p-3">
        <div className="px-2 mb-1">
          <p className="text-xs text-text-muted truncate">{userEmail}</p>
        </div>
        <button
          onClick={handleSignOut}
          className="w-full text-left px-2 py-1.5 text-sm text-text-muted hover:text-danger transition-colors rounded-md"
        >
          Sign out
        </button>
      </div>
    </aside>
  )
}
