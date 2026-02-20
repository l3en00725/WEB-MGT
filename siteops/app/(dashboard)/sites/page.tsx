import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'

export default async function SitesPage() {
  const supabase = createClient()
  const { data: sites } = await supabase.from('sites').select('*').order('name')

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-text-primary">Sites</h1>
        <Link
          href="/dashboard/sites/new"
          className="px-4 py-2 bg-accent hover:bg-accent-hover text-white text-sm font-medium rounded-md transition-colors"
        >
          Add site
        </Link>
      </div>

      {sites?.length ? (
        <div className="space-y-3">
          {sites.map((site) => (
            <div key={site.id} className="bg-background border border-border rounded-lg p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className={`w-2 h-2 rounded-full ${site.status === 'active' ? 'bg-success' : 'bg-text-muted'}`} />
                <div>
                  <h3 className="text-sm font-medium text-text-primary">{site.name}</h3>
                  <p className="text-xs text-text-muted mt-0.5">{site.domain} · {site.github_owner}/{site.github_repo}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  href={`/dashboard/queue/${site.id}`}
                  className="text-sm text-text-secondary hover:text-text-primary px-3 py-1.5 rounded hover:bg-surface-hover transition-colors"
                >
                  Queue
                </Link>
                <Link
                  href={`/dashboard/sites/${site.id}`}
                  className="text-sm text-text-secondary hover:text-text-primary px-3 py-1.5 rounded hover:bg-surface-hover transition-colors"
                >
                  View →
                </Link>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="border border-dashed border-border rounded-lg p-12 text-center">
          <p className="text-text-secondary text-sm mb-4">No sites yet. Add your first site to get started.</p>
          <Link
            href="/dashboard/sites/new"
            className="inline-flex items-center px-4 py-2 bg-accent hover:bg-accent-hover text-white text-sm font-medium rounded-md transition-colors"
          >
            Add site
          </Link>
        </div>
      )}
    </div>
  )
}
