import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'

export default async function HistoryPage() {
  const supabase = await createClient()

  const [{ data: auditLogs }, { data: deploys }] = await Promise.all([
    supabase
      .from('audit_log')
      .select('*, sites(name)')
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('deploys')
      .select('*, sites(name, domain)')
      .order('created_at', { ascending: false })
      .limit(20),
  ])

  // Merge and sort timeline
  const timelineItems = [
    ...(auditLogs ?? []).map(log => ({
      type: 'audit' as const,
      id: log.id,
      action: log.action,
      details: log.details as any,
      siteName: (log.sites as any)?.name,
      createdAt: log.created_at,
    })),
    ...(deploys ?? []).map(deploy => ({
      type: 'deploy' as const,
      id: deploy.id,
      action: `deploy_${deploy.status}`,
      details: { ...deploy, siteName: (deploy.sites as any)?.name },
      siteName: (deploy.sites as any)?.name,
      createdAt: deploy.created_at,
    })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-text-primary">History</h1>
        <p className="text-sm text-text-secondary mt-1">Complete audit log of all actions</p>
      </div>

      <div className="space-y-1">
        {timelineItems.map((item) => (
          <TimelineRow key={`${item.type}-${item.id}`} item={item} />
        ))}

        {!timelineItems.length && (
          <div className="text-center py-12 text-text-muted">
            <p className="text-sm">No history yet</p>
            <p className="text-xs mt-1">Actions will appear here as you use SiteOps</p>
          </div>
        )}
      </div>
    </div>
  )
}

const actionLabels: Record<string, { label: string; icon: string; color: string }> = {
  skill_run_started: { label: 'Skill run started', icon: '▶', color: 'text-blue-600' },
  skill_run_completed: { label: 'Skill run completed', icon: '✓', color: 'text-success' },
  skill_run_failed: { label: 'Skill run failed', icon: '✗', color: 'text-danger' },
  change_approved: { label: 'Change approved', icon: '✓', color: 'text-success' },
  change_rejected: { label: 'Change rejected', icon: '✗', color: 'text-text-muted' },
  deploy_created: { label: 'Deploy created', icon: '↑', color: 'text-blue-600' },
  deploy_promoted: { label: 'Deployed to production', icon: '★', color: 'text-success' },
  google_connected: { label: 'Google account connected', icon: '●', color: 'text-success' },
  site_deleted: { label: 'Site deleted', icon: '✗', color: 'text-danger' },
  deploy_pending: { label: 'Deploy pending', icon: '↑', color: 'text-text-muted' },
  deploy_preview_ready: { label: 'Preview ready', icon: '◎', color: 'text-blue-600' },
  deploy_promoted_status: { label: 'Deployed to production', icon: '★', color: 'text-success' },
  deploy_failed: { label: 'Deploy failed', icon: '✗', color: 'text-danger' },
}

function TimelineRow({ item }: { item: any }) {
  const meta = actionLabels[item.action] ?? {
    label: item.action.replace(/_/g, ' '),
    icon: '·',
    color: 'text-text-muted',
  }

  return (
    <div className="flex items-start gap-4 py-3 px-4 hover:bg-surface-hover rounded-lg transition-colors">
      <span className={`text-sm flex-shrink-0 w-4 text-center ${meta.color}`}>{meta.icon}</span>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm text-text-primary">{meta.label}</span>
          {item.siteName && (
            <span className="text-xs text-text-muted">· {item.siteName}</span>
          )}
        </div>

        {/* Deploy details */}
        {item.type === 'deploy' && item.details && (
          <div className="mt-0.5 flex items-center gap-2 text-xs text-text-muted">
            {item.details.github_branch && (
              <span className="font-mono">{item.details.github_branch}</span>
            )}
            {item.details.github_commit_sha && (
              <span className="font-mono">{item.details.github_commit_sha.slice(0, 7)}</span>
            )}
            {item.details.vercel_production_url && (
              <a
                href={item.details.vercel_production_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent hover:underline"
              >
                View live
              </a>
            )}
          </div>
        )}

        {/* Skill run details */}
        {item.action === 'skill_run_completed' && item.details?.results_count != null && (
          <p className="text-xs text-text-muted mt-0.5">
            {item.details.results_count} change{item.details.results_count !== 1 ? 's' : ''} proposed
          </p>
        )}

        {item.action === 'skill_run_failed' && item.details?.error && (
          <p className="text-xs text-danger mt-0.5 truncate">{item.details.error}</p>
        )}
      </div>

      <span className="text-xs text-text-muted flex-shrink-0">
        {new Date(item.createdAt).toLocaleString()}
      </span>
    </div>
  )
}
