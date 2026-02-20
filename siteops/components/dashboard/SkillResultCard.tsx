'use client'

interface SkillResultCardProps {
  result: any
  onApprove: () => void
  onReject: () => void
  isPending: boolean
}

export default function SkillResultCard({
  result,
  onApprove,
  onReject,
  isPending,
}: SkillResultCardProps) {
  const priorityColors: Record<string, string> = {
    high: 'text-priority-high bg-red-50 border-red-200',
    medium: 'text-priority-medium bg-yellow-50 border-yellow-200',
    low: 'text-priority-low bg-blue-50 border-blue-200',
  }

  const changeTypeLabels: Record<string, string> = {
    metadata: 'Metadata',
    content: 'Content',
    schema: 'Schema',
    image: 'Image',
    code: 'Code',
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto scrollbar-thin">
      {/* Header */}
      <div className="p-5 border-b border-border">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm">{result.skill_runs?.skills?.icon}</span>
              <span className="text-xs text-text-muted">{result.skill_runs?.skills?.name}</span>
              <span className="text-xs text-text-muted">·</span>
              <span className="text-xs text-text-muted font-mono">{result.page_path}</span>
            </div>
            <h2 className="text-base font-semibold text-text-primary">{result.field_name}</h2>
            <div className="flex items-center gap-2 mt-1">
              <span className={`text-xs px-1.5 py-0.5 rounded border font-medium ${priorityColors[result.priority]}`}>
                {result.priority}
              </span>
              <span className="text-xs px-1.5 py-0.5 rounded bg-surface text-text-secondary border border-border">
                {changeTypeLabels[result.change_type] ?? result.change_type}
              </span>
              {result.file_path_unresolved && (
                <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-50 text-warning border border-yellow-200">
                  File path unresolved
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={onReject}
              disabled={isPending}
              className="px-4 py-1.5 text-sm border border-border hover:border-danger hover:text-danger rounded-md transition-colors disabled:opacity-50"
            >
              Reject
            </button>
            <button
              onClick={onApprove}
              disabled={isPending}
              className="px-4 py-1.5 text-sm bg-accent hover:bg-accent-hover text-white rounded-md transition-colors disabled:opacity-50"
            >
              Approve
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 p-5 space-y-5">
        {/* Diff */}
        <div>
          <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">Change</h3>
          <div className="space-y-2">
            <div className="rounded-md overflow-hidden border border-border">
              <div className="px-3 py-1.5 bg-red-50 border-b border-border flex items-center gap-2">
                <span className="text-xs font-medium text-danger">Before</span>
              </div>
              <div className="p-3 bg-red-50/50">
                <pre className="text-xs text-text-secondary font-mono whitespace-pre-wrap break-all">
                  {result.value_before || '(empty)'}
                </pre>
              </div>
            </div>
            <div className="rounded-md overflow-hidden border border-border">
              <div className="px-3 py-1.5 bg-green-50 border-b border-border flex items-center gap-2">
                <span className="text-xs font-medium text-success">After</span>
              </div>
              <div className="p-3 bg-green-50/50">
                <pre className="text-xs text-text-secondary font-mono whitespace-pre-wrap break-all">
                  {result.value_after}
                </pre>
              </div>
            </div>
          </div>
        </div>

        {/* Media preview if image change */}
        {result.media_assets?.public_url && (
          <div>
            <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">Proposed image</h3>
            <div className="border border-border rounded-md overflow-hidden">
              <img
                src={result.media_assets.public_url}
                alt={result.media_assets.filename}
                className="w-full max-h-48 object-cover"
              />
              <div className="p-2 bg-surface text-xs text-text-muted flex items-center justify-between">
                <span>{result.media_assets.filename}</span>
                {result.media_assets.is_discover_eligible && (
                  <span className="text-success">Discover eligible</span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* AI reasoning */}
        <div>
          <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">Why this change</h3>
          <p className="text-sm text-text-secondary leading-relaxed">{result.ai_reasoning}</p>
        </div>

        {/* Metrics */}
        {(result.gsc_metric || result.ga4_metric) && (
          <div>
            <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">Supporting data</h3>
            <div className="grid grid-cols-2 gap-2">
              {result.gsc_metric && Object.entries(result.gsc_metric).map(([key, value]) => (
                <div key={key} className="bg-surface rounded-md p-2.5">
                  <p className="text-xs text-text-muted capitalize">{key.replace(/_/g, ' ')}</p>
                  <p className="text-sm font-medium text-text-primary mt-0.5">
                    {typeof value === 'number'
                      ? key.includes('ctr') || key.includes('rate')
                        ? `${(value * 100).toFixed(1)}%`
                        : value.toLocaleString()
                      : String(value)}
                  </p>
                </div>
              ))}
              {result.ga4_metric && Object.entries(result.ga4_metric).map(([key, value]) => (
                <div key={key} className="bg-surface rounded-md p-2.5">
                  <p className="text-xs text-text-muted capitalize">{key.replace(/_/g, ' ')}</p>
                  <p className="text-sm font-medium text-text-primary mt-0.5">
                    {typeof value === 'number'
                      ? key.includes('rate')
                        ? `${(value * 100).toFixed(1)}%`
                        : value.toLocaleString()
                      : String(value)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* File path */}
        <div>
          <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">File</h3>
          <code className={`text-xs px-2 py-1 rounded bg-surface border border-border ${result.file_path_unresolved ? 'text-warning' : 'text-text-secondary'}`}>
            {result.file_path}
          </code>
          {result.file_path_unresolved && (
            <p className="text-xs text-warning mt-1">
              This file path could not be verified in the repository. The change is valid but the file path may need manual correction.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
