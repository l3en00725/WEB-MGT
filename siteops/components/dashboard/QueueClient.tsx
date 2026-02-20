'use client'

import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import SkillResultCard from './SkillResultCard'
import PreviewFrame from './PreviewFrame'

interface Site { id: string; name: string; domain: string }
interface Skill { id: string; name: string; slug: string; icon: string }

interface QueueClientProps {
  sites: Site[]
  skills: Skill[]
  defaultSiteId?: string
}

export default function QueueClient({ sites, skills, defaultSiteId }: QueueClientProps) {
  const [selectedSiteId, setSelectedSiteId] = useState<string>(defaultSiteId ?? sites[0]?.id ?? '')
  const [selectedResultId, setSelectedResultId] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [filterSkill, setFilterSkill] = useState<string>('all')
  const [filterPriority, setFilterPriority] = useState<string>('all')
  const queryClient = useQueryClient()
  const supabase = createClient()

  // Fetch pending results
  const { data: results, isLoading } = useQuery({
    queryKey: ['queue', selectedSiteId, filterSkill, filterPriority],
    queryFn: async () => {
      if (!selectedSiteId) return []

      let query = supabase
        .from('skill_results')
        .select('*, skill_runs(id, skill_id, skills(name, slug, icon)), media_assets(public_url, filename, is_discover_eligible)')
        .eq('site_id', selectedSiteId)
        .eq('status', 'pending')
        .order('priority', { ascending: false })
        .order('created_at', { ascending: false })

      if (filterPriority !== 'all') {
        query = query.eq('priority', filterPriority)
      }

      const { data } = await query
      return (data ?? []).filter((r: any) => {
        if (filterSkill === 'all') return true
        return r.skill_runs?.skill_id === filterSkill || r.skill_runs?.skills?.slug === filterSkill
      })
    },
    refetchInterval: 10000,
  })

  // Fetch approved count for deploy button
  const { data: approvedCount } = useQuery({
    queryKey: ['approved-count', selectedSiteId],
    queryFn: async () => {
      const { count } = await supabase
        .from('skill_results')
        .select('*', { count: 'exact', head: true })
        .eq('site_id', selectedSiteId)
        .eq('status', 'approved')
      return count ?? 0
    },
    refetchInterval: 5000,
  })

  // Fetch active deploy for site
  const { data: activeDeploy } = useQuery({
    queryKey: ['active-deploy', selectedSiteId],
    queryFn: async () => {
      const { data } = await supabase
        .from('deploys')
        .select('*')
        .eq('site_id', selectedSiteId)
        .in('status', ['pending', 'preview_ready'])
        .order('created_at', { ascending: false })
        .limit(1)
        .single()
      return data
    },
    refetchInterval: 5000,
  })

  // Review mutation (approve/reject)
  const reviewMutation = useMutation({
    mutationFn: async ({ resultId, action }: { resultId: string; action: 'approved' | 'rejected' }) => {
      const res = await fetch(`/api/skill-results/${resultId}/review`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      if (!res.ok) throw new Error('Failed to review')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['queue'] })
      queryClient.invalidateQueries({ queryKey: ['approved-count'] })
      queryClient.invalidateQueries({ queryKey: ['pending-count'] })
      setSelectedResultId(null)
    },
  })

  // Deploy mutation
  const deployMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/deploys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteId: selectedSiteId }),
      })
      if (!res.ok) throw new Error('Failed to create deploy')
      return res.json()
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['active-deploy'] })
      if (data.vercel_preview_url) {
        setPreviewUrl(data.vercel_preview_url)
      }
    },
  })

  const selectedResult = results?.find((r: any) => r.id === selectedResultId)

  return (
    <div className="flex h-full">
      {/* Column 1: Sites list */}
      <div className="w-[200px] flex-shrink-0 border-r border-border overflow-y-auto scrollbar-thin">
        <div className="p-3 border-b border-border">
          <h2 className="text-xs font-semibold text-text-muted uppercase tracking-wider">Sites</h2>
        </div>
        {sites.map(site => {
          const isSelected = site.id === selectedSiteId
          return (
            <button
              key={site.id}
              onClick={() => { setSelectedSiteId(site.id); setSelectedResultId(null) }}
              className={`w-full text-left px-3 py-2.5 border-b border-border text-sm transition-colors ${
                isSelected ? 'bg-surface-hover text-text-primary font-medium' : 'text-text-secondary hover:bg-surface-hover'
              }`}
            >
              {site.name}
            </button>
          )
        })}
      </div>

      {/* Column 2: Results list */}
      <div className="w-[300px] flex-shrink-0 border-r border-border flex flex-col overflow-hidden">
        {/* Filters + header */}
        <div className="p-3 border-b border-border space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-text-primary">
              Pending {results?.length ? `(${results.length})` : ''}
            </h2>
            {(approvedCount ?? 0) > 0 && (
              <button
                onClick={() => deployMutation.mutate()}
                disabled={deployMutation.isPending}
                className="px-3 py-1 text-xs font-medium bg-accent hover:bg-accent-hover text-white rounded-md transition-colors disabled:opacity-50"
              >
                {deployMutation.isPending ? 'Deploying...' : `Deploy ${approvedCount}`}
              </button>
            )}
          </div>

          <div className="flex gap-2">
            <select
              value={filterSkill}
              onChange={e => setFilterSkill(e.target.value)}
              className="flex-1 text-xs border border-border rounded px-2 py-1 bg-background text-text-secondary"
            >
              <option value="all">All skills</option>
              {skills.map(s => (
                <option key={s.id} value={s.slug}>{s.icon} {s.name}</option>
              ))}
            </select>
            <select
              value={filterPriority}
              onChange={e => setFilterPriority(e.target.value)}
              className="flex-1 text-xs border border-border rounded px-2 py-1 bg-background text-text-secondary"
            >
              <option value="all">All priority</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {isLoading && (
            <div className="p-4 space-y-2">
              {[1,2,3].map(i => (
                <div key={i} className="animate-pulse h-20 bg-surface rounded" />
              ))}
            </div>
          )}

          {!isLoading && !results?.length && (
            <div className="p-6 text-center">
              <p className="text-sm text-text-muted">No pending changes</p>
              <p className="text-xs text-text-muted mt-1">Run a skill to generate proposals</p>
            </div>
          )}

          {results?.map((result: any) => (
            <ResultListItem
              key={result.id}
              result={result}
              isSelected={result.id === selectedResultId}
              onClick={() => setSelectedResultId(result.id)}
            />
          ))}
        </div>

        {/* Deploy status */}
        {activeDeploy && (
          <div className="p-3 border-t border-border bg-surface">
            <DeployStatusBar deploy={activeDeploy} onPreview={setPreviewUrl} />
          </div>
        )}
      </div>

      {/* Column 3: Diff view + Preview */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selectedResult ? (
          <SkillResultCard
            result={selectedResult}
            onApprove={() => reviewMutation.mutate({ resultId: selectedResult.id, action: 'approved' })}
            onReject={() => reviewMutation.mutate({ resultId: selectedResult.id, action: 'rejected' })}
            isPending={reviewMutation.isPending}
          />
        ) : previewUrl ? (
          <PreviewFrame
            url={previewUrl}
            deployId={activeDeploy?.id}
            onPromote={() => {
              if (activeDeploy) {
                fetch(`/api/deploys/${activeDeploy.id}/promote`, { method: 'POST' })
                  .then(() => {
                    queryClient.invalidateQueries({ queryKey: ['active-deploy'] })
                    setPreviewUrl(null)
                  })
              }
            }}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-text-muted">
            <div className="text-center">
              <p className="text-sm">Select a change to review</p>
              {(approvedCount ?? 0) > 0 && (
                <p className="text-xs mt-1">{approvedCount} change{approvedCount !== 1 ? 's' : ''} approved and ready to deploy</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function ResultListItem({
  result,
  isSelected,
  onClick,
}: {
  result: any
  isSelected: boolean
  onClick: () => void
}) {
  const priorityColors: Record<string, string> = {
    high: 'bg-priority-high',
    medium: 'bg-priority-medium',
    low: 'bg-priority-low',
  }

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-3 border-b border-border transition-colors ${
        isSelected ? 'bg-surface-hover' : 'hover:bg-surface-hover'
      }`}
    >
      <div className="flex items-start gap-2">
        <span className={`mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${priorityColors[result.priority] ?? 'bg-text-muted'}`} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1 mb-0.5">
            <span className="text-xs text-text-muted">{result.skill_runs?.skills?.icon}</span>
            <span className="text-xs text-text-muted truncate">{result.page_path}</span>
          </div>
          <p className="text-sm text-text-primary font-medium truncate">{result.field_name}</p>
          <p className="text-xs text-text-muted truncate mt-0.5">{result.value_after.slice(0, 60)}</p>
        </div>
      </div>
    </button>
  )
}

function DeployStatusBar({ deploy, onPreview }: { deploy: any; onPreview: (url: string) => void }) {
  const statusColors: Record<string, string> = {
    pending: 'text-text-muted',
    preview_ready: 'text-success',
    failed: 'text-danger',
  }

  return (
    <div className="flex items-center justify-between gap-2">
      <div>
        <p className={`text-xs font-medium ${statusColors[deploy.status] ?? 'text-text-muted'}`}>
          {deploy.status === 'pending' ? 'Deploying...' : deploy.status === 'preview_ready' ? 'Preview ready' : deploy.status}
        </p>
        <p className="text-xs text-text-muted truncate">{deploy.github_branch}</p>
      </div>
      {deploy.status === 'preview_ready' && deploy.vercel_preview_url && (
        <button
          onClick={() => onPreview(deploy.vercel_preview_url!)}
          className="text-xs text-accent hover:underline whitespace-nowrap"
        >
          Preview →
        </button>
      )}
    </div>
  )
}
