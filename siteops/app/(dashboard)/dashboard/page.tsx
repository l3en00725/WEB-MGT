import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'

export default async function DashboardPage() {
  const supabase = await createClient()

  const { data: sites } = await supabase
    .from('sites')
    .select('*')
    .order('name')

  const { count: pendingCount } = await supabase
    .from('skill_results')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending')

  const { data: recentRuns } = await supabase
    .from('skill_runs')
    .select('*, skills(name, icon), sites(name)')
    .order('created_at', { ascending: false })
    .limit(5)

  return (
    <div className="p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-text-primary">Overview</h1>
        <p className="text-sm text-text-secondary mt-1">
          {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-background border border-border rounded-lg p-4">
          <p className="text-sm text-text-muted">Sites</p>
          <p className="text-3xl font-semibold text-text-primary mt-1">{sites?.length ?? 0}</p>
        </div>
        <div className="bg-background border border-border rounded-lg p-4">
          <p className="text-sm text-text-muted">Pending review</p>
          <p className="text-3xl font-semibold text-text-primary mt-1">{pendingCount ?? 0}</p>
          {(pendingCount ?? 0) > 0 && (
            <Link href="/dashboard/queue" className="text-xs text-accent mt-1 inline-block hover:underline">
              Review now →
            </Link>
          )}
        </div>
        <div className="bg-background border border-border rounded-lg p-4">
          <p className="text-sm text-text-muted">Active sites</p>
          <p className="text-3xl font-semibold text-text-primary mt-1">
            {sites?.filter(s => s.status === 'active').length ?? 0}
          </p>
        </div>
      </div>

      {/* Sites */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-text-primary">Sites</h2>
          <Link href="/dashboard/sites/new" className="text-sm text-accent hover:underline">
            Add site
          </Link>
        </div>

        {sites?.length ? (
          <div className="grid grid-cols-2 gap-3">
            {sites.map((site) => (
              <SiteCard key={site.id} site={site} />
            ))}
          </div>
        ) : (
          <div className="border border-dashed border-border rounded-lg p-8 text-center">
            <p className="text-text-secondary text-sm mb-3">No sites added yet</p>
            <Link
              href="/dashboard/sites/new"
              className="inline-flex items-center px-4 py-2 bg-accent hover:bg-accent-hover text-white text-sm font-medium rounded-md transition-colors"
            >
              Add your first site
            </Link>
          </div>
        )}
      </div>

      {/* Recent skill runs */}
      {recentRuns?.length ? (
        <div>
          <h2 className="text-base font-semibold text-text-primary mb-4">Recent skill runs</h2>
          <div className="space-y-2">
            {recentRuns.map((run: any) => (
              <div key={run.id} className="flex items-center justify-between py-2.5 px-4 bg-background border border-border rounded-lg">
                <div className="flex items-center gap-3">
                  <span className="text-base">{run.skills?.icon}</span>
                  <div>
                    <p className="text-sm font-medium text-text-primary">{run.skills?.name}</p>
                    <p className="text-xs text-text-muted">{run.sites?.name}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <StatusBadge status={run.status} />
                  <span className="text-xs text-text-muted">
                    {new Date(run.created_at).toLocaleDateString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function SiteCard({ site }: { site: any }) {
  return (
    <Link
      href={`/dashboard/sites/${site.id}`}
      className="bg-background border border-border rounded-lg p-4 hover:border-border-strong transition-colors"
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
            site.status === 'active' ? 'bg-success' : 'bg-text-muted'
          }`} />
          <h3 className="text-sm font-medium text-text-primary">{site.name}</h3>
        </div>
        <span className={`text-xs px-1.5 py-0.5 rounded ${
          site.status === 'active'
            ? 'bg-green-50 text-success'
            : 'bg-gray-100 text-text-muted'
        }`}>
          {site.status}
        </span>
      </div>
      <p className="text-xs text-text-muted">{site.domain}</p>
      <div className="mt-3 flex items-center gap-2 text-xs text-text-muted">
        <span>{site.github_owner}/{site.github_repo}</span>
      </div>
    </Link>
  )
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    running: 'bg-blue-50 text-blue-700',
    completed: 'bg-green-50 text-success',
    failed: 'bg-red-50 text-danger',
  }
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${styles[status] ?? 'bg-gray-50 text-text-muted'}`}>
      {status}
    </span>
  )
}
