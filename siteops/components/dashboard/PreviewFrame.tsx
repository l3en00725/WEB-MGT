'use client'

import { useState } from 'react'

interface PreviewFrameProps {
  url: string
  deployId?: string
  onPromote?: () => void
}

export default function PreviewFrame({ url, deployId, onPromote }: PreviewFrameProps) {
  const [isPromoting, setIsPromoting] = useState(false)
  const [promoted, setPromoted] = useState(false)

  async function handlePromote() {
    if (!onPromote) return
    setIsPromoting(true)
    onPromote()
    setPromoted(true)
    setIsPromoting(false)
  }

  return (
    <div className="flex flex-col h-full bg-surface">
      {/* Browser chrome */}
      <div className="flex items-center gap-3 px-4 py-2.5 bg-background border-b border-border">
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <div className="w-3 h-3 rounded-full bg-[#ff5f57]" />
          <div className="w-3 h-3 rounded-full bg-[#febc2e]" />
          <div className="w-3 h-3 rounded-full bg-[#28c840]" />
        </div>

        <div className="flex-1 flex items-center bg-surface border border-border rounded-md px-3 py-1">
          <span className="text-xs text-text-muted truncate">{url}</span>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-text-muted hover:text-accent transition-colors"
          >
            Open ↗
          </a>
          {onPromote && !promoted && (
            <button
              onClick={handlePromote}
              disabled={isPromoting}
              className="px-3 py-1 text-xs font-medium bg-success hover:bg-green-700 text-white rounded-md transition-colors disabled:opacity-50"
            >
              {isPromoting ? 'Promoting...' : 'Deploy to production'}
            </button>
          )}
          {promoted && (
            <span className="text-xs text-success font-medium">Deployed to production</span>
          )}
        </div>
      </div>

      {/* iFrame */}
      <div className="flex-1 relative">
        <iframe
          src={url}
          className="w-full h-full border-0"
          title="Preview"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        />
      </div>
    </div>
  )
}
