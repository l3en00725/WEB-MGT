import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import PageSpeedPanel from '@/components/dashboard/PageSpeedPanel'

export default async function SiteOverviewPage({
  params,
}: {
  params: { siteId: string }
}) {
  const supabase = createClient()

  const { data: site } = await supabase
    .from('sites')
    .select('*')
    .eq('id', params.siteId)
    .single()

  if (!site) notFound()

  // Fetch skill runs and pending results
  const [{ data: recentRuns }, { count: pendingCount }, { data: recentDeploys }] = await Promise.all([
    supabase
      .from('skill_runs')
      .select('*, skills(name, icon, slug)')
      .eq('site_id', params.siteId)
      .order('created_at', { ascending: false })
      .limit(5),
    supabase
      .from('skill_results')
      .select('*', { count: 'exact', head: true })
      .eq('site_id', params.siteId)
      .eq('status', 'pending'),
    supabase
      .from('deploys')
      .select('*')
      .eq('site_id', params.siteId)
      .order('created_at', { ascending: false })
      .limit(3),
  ])

  // Fetch site skills
  const { data: siteSkills } = await supabase
    .from('site_skills')
    .select('*, skills(name, icon, slug, description)')
    .eq('site_id', params.siteId)

  // Check which integrations are connected
  const { data: tokens } = await supabase
    .from('site_tokens')
    .select('token_type')
    .eq('site_id', params.siteId)

  const connectedTokens = new Set(tokens?.map(t => t.token_type) ?? [])

  return (
    <div className="p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className={`w-2 h-2 rounded-full ${site.status === 'active' ? 'bg-success' : 'bg-text-muted'}`} />
            <h1 className="text-2xl font-semibold text-text-primary">{site.name}</h1>
          </div>
          <p className="text-sm text-text-muted">{site.domain}</p>
        </div>
        <div className="flex items-center gap-2">
          {(pendingCount ?? 0) > 0 && (
            <Link
              href={`/dashboard/queue/${params.siteId}`}
              className="flex items-center gap-1.5 px-4 py-2 bg-accent hover:bg-accent-hover text-white text-sm font-medium rounded-md transition-colors"
            >
              Review {pendingCount} change{pendingCount !== 1 ? 's' : ''}
            </Link>
          )}
          <Link
            href={`/dashboard/sites/${params.siteId}/settings`}
            className="px-3 py-2 text-sm text-text-secondary hover:text-text-primary border border-border hover:border-border-strong rounded-md transition-colors"
          >
            Settings
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Left column */}
        <div className="col-span-2 space-y-6">
          {/* Page Speed Panel */}
          <PageSpeedPanel siteId={params.siteId} domain={site.domain} />

          {/* Active skills */}
          <div className="bg-background border border-border rounded-lg p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-text-primary">Active skills</h2>
              <Link href="/dashboard/skills" className="text-xs text-text-muted hover:text-accent">
                Manage →
              </Link>
            </div>
            <div className="space-y-2">
              {siteSkills?.map((ss: any) => (
                <div key={ss.id} className="flex items-center justify-between py-2 px-3 rounded-md hover:bg-surface-hover">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{ss.skills?.icon}</span>
                    <span className="text-sm text-text-primary">{ss.skills?.name}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    {ss.last_run_at && (
                      <span className="text-xs text-text-muted">
                        Last: {new Date(ss.last_run_at).toLocaleDateString()}
                      </span>
                    )}
                    <RunSkillButton siteId={params.siteId} skillId={ss.skill_id} skillName={ss.skills?.name} />
                    <span className={`text-xs px-1.5 py-0.5 rounded ${ss.is_active ? 'bg-green-50 text-success' : 'bg-gray-100 text-text-muted'}`}>
                      {ss.is_active ? 'active' : 'paused'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Recent runs */}
          {recentRuns?.length ? (
            <div className="bg-background border border-border rounded-lg p-5">
              <h2 className="text-sm font-semibold text-text-primary mb-4">Recent skill runs</h2>
              <div className="space-y-2">
                {recentRuns.map((run: any) => (
                  <div key={run.id} className="flex items-center justify-between py-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{run.skills?.icon}</span>
                      <span className="text-sm text-text-primary">{run.skills?.name}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <StatusBadge status={run.status} />
                      <span className="text-xs text-text-muted">
                        {new Date(run.created_at).toLocaleString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        {/* Right column */}
        <div className="space-y-4">
          {/* Integration status */}
          <div className="bg-background border border-border rounded-lg p-4">
            <h3 className="text-sm font-semibold text-text-primary mb-3">Integrations</h3>
            <div className="space-y-2">
              <IntegrationRow
                label="GitHub"
                connected={connectedTokens.has('github')}
                href={`/dashboard/sites/${params.siteId}/settings`}
              />
              <IntegrationRow
                label="Google (GSC + GA4)"
                connected={connectedTokens.has('google_oauth')}
                href={`/api/sites/${params.siteId}/connect-google`}
                isOAuth
              />
              <IntegrationRow
                label="Vercel"
                connected={connectedTokens.has('vercel')}
                href={`/dashboard/sites/${params.siteId}/settings`}
              />
            </div>
          </div>

          {/* Recent deploys */}
          {recentDeploys?.length ? (
            <div className="bg-background border border-border rounded-lg p-4">
              <h3 className="text-sm font-semibold text-text-primary mb-3">Recent deploys</h3>
              <div className="space-y-2">
                {recentDeploys.map((deploy: any) => (
                  <div key={deploy.id} className="text-xs">
                    <div className="flex items-center justify-between">
                      <StatusBadge status={deploy.status} />
                      <span className="text-text-muted">{new Date(deploy.created_at).toLocaleDateString()}</span>
                    </div>
                    {deploy.github_branch && (
                      <p className="text-text-muted mt-0.5 truncate">{deploy.github_branch}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* Site info */}
          <div className="bg-background border border-border rounded-lg p-4">
            <h3 className="text-sm font-semibold text-text-primary mb-3">Site info</h3>
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-text-muted">Repo</span>
                <span className="text-text-secondary font-mono">{site.github_owner}/{site.github_repo}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">Branch</span>
                <span className="text-text-secondary font-mono">{site.github_default_branch}</span>
              </div>
              {site.gsc_property && (
                <div className="flex justify-between">
                  <span className="text-text-muted">GSC</span>
                  <span className="text-text-secondary truncate max-w-[120px]">{site.gsc_property}</span>
                </div>
              )}
              {site.ga4_property_id && (
                <div className="flex justify-between">
                  <span className="text-text-muted">GA4</span>
                  <span className="text-text-secondary">{site.ga4_property_id}</span>
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-2">
            <Link
              href={`/dashboard/sites/${params.siteId}/media`}
              className="flex-1 text-center py-2 text-sm text-text-secondary border border-border hover:border-border-strong rounded-md hover:bg-surface-hover transition-colors"
            >
              Media library
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

function IntegrationRow({
  label,
  connected,
  href,
  isOAuth,
}: {
  label: string
  connected: boolean
  href: string
  isOAuth?: boolean
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-text-secondary">{label}</span>
      {connected ? (
        <span className="text-xs text-success">Connected</span>
      ) : (
        <Link
          href={href}
          className="text-xs text-accent hover:underline"
        >
          Connect
        </Link>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    running: 'bg-blue-50 text-blue-700',
    completed: 'bg-green-50 text-success',
    failed: 'bg-red-50 text-danger',
    pending: 'bg-gray-100 text-text-secondary',
    preview_ready: 'bg-blue-50 text-blue-700',
    promoted: 'bg-green-50 text-success',
    cancelled: 'bg-gray-100 text-text-muted',
  }
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${styles[status] ?? 'bg-gray-50 text-text-muted'}`}>
      {status.replace('_', ' ')}
    </span>
  )
}

function RunSkillButton({ siteId, skillId, skillName }: { siteId: string; skillId: string; skillName: string }) {
  return (
    <form action={`/api/skills/run`} method="POST">
      <input type="hidden" name="siteId" value={siteId} />
      <input type="hidden" name="skillId" value={skillId} />
      <button
        type="submit"
        className="text-xs text-text-muted hover:text-accent px-2 py-1 rounded hover:bg-surface-hover transition-colors"
        title={`Run ${skillName}`}
      >
        Run
      </button>
    </form>
  )
}
