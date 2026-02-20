'use client'

import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'

interface PSIResult {
  strategy: 'mobile' | 'desktop'
  performance_score: number
  seo_score: number
  lcp_ms: number
  cls_score: number
  inp_ms: number
  opportunities: { title: string; savings_ms?: number }[]
  created_at: string
}

interface PageSpeedPanelProps {
  siteId: string
  domain: string
}

function ScoreGauge({ score, label }: { score: number; label: string }) {
  const color = score >= 90 ? 'text-success' : score >= 50 ? 'text-warning' : 'text-danger'
  const bgColor = score >= 90 ? 'bg-green-50' : score >= 50 ? 'bg-yellow-50' : 'bg-red-50'

  return (
    <div className={`flex flex-col items-center p-3 rounded-lg ${bgColor}`}>
      <span className={`text-2xl font-bold ${color}`}>{score}</span>
      <span className="text-xs text-text-muted mt-0.5">{label}</span>
    </div>
  )
}

function MetricBadge({ label, value, unit, good, needsImprovement }: {
  label: string
  value: number | null
  unit: string
  good: number
  needsImprovement: number
}) {
  if (value === null) return null
  const color = value <= good ? 'text-success' : value <= needsImprovement ? 'text-warning' : 'text-danger'
  const display = unit === 'ms' ? `${(value / 1000).toFixed(1)}s` : value.toFixed(2)

  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-xs text-text-secondary">{label}</span>
      <span className={`text-xs font-medium ${color}`}>{display}</span>
    </div>
  )
}

export default function PageSpeedPanel({ siteId, domain }: PageSpeedPanelProps) {
  const [refreshing, setRefreshing] = useState(false)

  const { data, isLoading, refetch } = useQuery<{ mobile: PSIResult; desktop: PSIResult } | null>({
    queryKey: ['pagespeed', siteId],
    queryFn: async () => {
      const res = await fetch(`/api/sites/${siteId}/pagespeed`)
      if (!res.ok) return null
      return res.json()
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  })

  async function handleRefresh() {
    setRefreshing(true)
    await refetch()
    setRefreshing(false)
  }

  if (isLoading) {
    return (
      <div className="bg-background border border-border rounded-lg p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-text-primary">Page Speed</h2>
        </div>
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-surface rounded w-1/3" />
          <div className="h-16 bg-surface rounded" />
        </div>
      </div>
    )
  }

  return (
    <div className="bg-background border border-border rounded-lg p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-text-primary">Page Speed</h2>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="text-xs text-text-muted hover:text-accent transition-colors disabled:opacity-50"
        >
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {!data ? (
        <div className="text-center py-4">
          <p className="text-sm text-text-muted mb-3">No speed data yet</p>
          <button
            onClick={handleRefresh}
            className="text-sm text-accent hover:underline"
          >
            Run PageSpeed analysis
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Score gauges */}
          <div>
            <div className="grid grid-cols-2 gap-3 mb-2">
              <div>
                <p className="text-xs text-text-muted mb-2 font-medium">Mobile</p>
                <div className="grid grid-cols-2 gap-2">
                  <ScoreGauge score={data.mobile?.performance_score ?? 0} label="Perf" />
                  <ScoreGauge score={data.mobile?.seo_score ?? 0} label="SEO" />
                </div>
              </div>
              <div>
                <p className="text-xs text-text-muted mb-2 font-medium">Desktop</p>
                <div className="grid grid-cols-2 gap-2">
                  <ScoreGauge score={data.desktop?.performance_score ?? 0} label="Perf" />
                  <ScoreGauge score={data.desktop?.seo_score ?? 0} label="SEO" />
                </div>
              </div>
            </div>
          </div>

          {/* Core Web Vitals */}
          <div>
            <p className="text-xs font-medium text-text-muted mb-2">Core Web Vitals (mobile)</p>
            <div className="space-y-1">
              <MetricBadge
                label="LCP"
                value={data.mobile?.lcp_ms ?? null}
                unit="ms"
                good={2500}
                needsImprovement={4000}
              />
              <MetricBadge
                label="CLS"
                value={data.mobile?.cls_score ?? null}
                unit="score"
                good={0.1}
                needsImprovement={0.25}
              />
              <MetricBadge
                label="INP"
                value={data.mobile?.inp_ms ?? null}
                unit="ms"
                good={200}
                needsImprovement={500}
              />
            </div>
          </div>

          {/* Top opportunities */}
          {data.mobile?.opportunities?.length ? (
            <div>
              <p className="text-xs font-medium text-text-muted mb-2">Top opportunities</p>
              <div className="space-y-1">
                {data.mobile.opportunities.slice(0, 3).map((opp, i) => (
                  <div key={i} className="flex items-start justify-between gap-2 py-1">
                    <span className="text-xs text-text-secondary">{opp.title}</span>
                    {opp.savings_ms && (
                      <span className="text-xs text-text-muted whitespace-nowrap">
                        -{(opp.savings_ms / 1000).toFixed(1)}s
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <p className="text-xs text-text-muted">
            Last updated {data.mobile?.created_at ? new Date(data.mobile.created_at).toLocaleString() : 'never'}
          </p>
        </div>
      )}
    </div>
  )
}
