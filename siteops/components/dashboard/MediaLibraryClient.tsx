'use client'

import { useState, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

interface MediaAsset {
  id: string
  filename: string
  original_filename: string
  public_url: string
  mime_type: string
  width_px: number | null
  height_px: number | null
  file_size_bytes: number | null
  is_discover_eligible: boolean | null
  alt_text: string | null
  created_at: string
}

interface MediaLibraryClientProps {
  siteId: string
  initialAssets: MediaAsset[]
}

export default function MediaLibraryClient({ siteId, initialAssets }: MediaLibraryClientProps) {
  const [filter, setFilter] = useState<'all' | 'eligible' | 'ineligible'>('all')
  const [dragOver, setDragOver] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadMessage, setUploadMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const queryClient = useQueryClient()
  const supabase = createClient()

  const { data: assets } = useQuery({
    queryKey: ['media-assets', siteId],
    queryFn: async () => {
      const { data } = await supabase
        .from('media_assets')
        .select('*')
        .eq('site_id', siteId)
        .order('created_at', { ascending: false })
      return data ?? []
    },
    initialData: initialAssets,
  })

  const deleteMutation = useMutation({
    mutationFn: async (assetId: string) => {
      const res = await fetch(`/api/sites/${siteId}/media/${assetId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete')
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['media-assets', siteId] })
    },
  })

  async function handleUpload(files: FileList | null) {
    if (!files?.length) return
    setUploading(true)
    setUploadMessage(null)

    for (const file of Array.from(files)) {
      if (file.size > 10 * 1024 * 1024) {
        setUploadMessage({ type: 'error', text: `${file.name} exceeds 10MB limit` })
        continue
      }

      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch(`/api/sites/${siteId}/media/upload`, {
        method: 'POST',
        body: formData,
      })

      if (res.ok) {
        setUploadMessage({ type: 'success', text: `${file.name} uploaded successfully` })
        queryClient.invalidateQueries({ queryKey: ['media-assets', siteId] })
      } else {
        const err = await res.json()
        setUploadMessage({ type: 'error', text: err.error ?? `Failed to upload ${file.name}` })
      }
    }

    setUploading(false)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    handleUpload(e.dataTransfer.files)
  }

  function copyUrl(url: string) {
    navigator.clipboard.writeText(url)
  }

  const filteredAssets = assets?.filter(a => {
    if (filter === 'eligible') return a.is_discover_eligible
    if (filter === 'ineligible') return !a.is_discover_eligible
    return true
  })

  return (
    <div className="space-y-5">
      {uploadMessage && (
        <div className={`p-3 text-sm rounded-md ${
          uploadMessage.type === 'success'
            ? 'bg-green-50 text-success border border-green-200'
            : 'bg-red-50 text-danger border border-red-200'
        }`}>
          {uploadMessage.text}
        </div>
      )}

      {/* Upload zone */}
      <div
        onDrop={handleDrop}
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
          dragOver ? 'border-accent bg-blue-50' : 'border-border hover:border-border-strong'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml"
          onChange={e => handleUpload(e.target.files)}
          className="hidden"
        />
        {uploading ? (
          <p className="text-sm text-text-muted">Uploading...</p>
        ) : (
          <>
            <p className="text-sm text-text-secondary">Drop images here or click to upload</p>
            <p className="text-xs text-text-muted mt-1">JPEG, PNG, WebP, GIF, SVG · Max 10MB</p>
            <p className="text-xs text-text-muted">Images auto-converted to WebP with Discover-eligible (1200×630) variant</p>
          </>
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          {(['all', 'eligible', 'ineligible'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                filter === f
                  ? 'bg-surface-hover text-text-primary font-medium'
                  : 'text-text-secondary hover:bg-surface-hover'
              }`}
            >
              {f === 'all' ? 'All' : f === 'eligible' ? 'Discover eligible' : 'Not eligible'}
              {f === 'all' && ` (${assets?.length ?? 0})`}
              {f === 'eligible' && ` (${assets?.filter(a => a.is_discover_eligible).length ?? 0})`}
              {f === 'ineligible' && ` (${assets?.filter(a => !a.is_discover_eligible).length ?? 0})`}
            </button>
          ))}
        </div>
      </div>

      {/* Asset grid */}
      {!filteredAssets?.length ? (
        <div className="py-12 text-center">
          <p className="text-sm text-text-muted">No images yet</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {filteredAssets.map(asset => (
            <AssetCard
              key={asset.id}
              asset={asset}
              onCopy={() => copyUrl(asset.public_url)}
              onDelete={() => {
                if (confirm(`Delete ${asset.original_filename}?`)) {
                  deleteMutation.mutate(asset.id)
                }
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function AssetCard({
  asset,
  onCopy,
  onDelete,
}: {
  asset: MediaAsset
  onCopy: () => void
  onDelete: () => void
}) {
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    onCopy()
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const fileSizeKB = asset.file_size_bytes ? Math.round(asset.file_size_bytes / 1024) : null

  return (
    <div className="bg-background border border-border rounded-lg overflow-hidden group">
      <div className="aspect-video bg-surface relative">
        <img
          src={asset.public_url}
          alt={asset.alt_text ?? asset.filename}
          className="w-full h-full object-cover"
        />
        {asset.is_discover_eligible && (
          <div className="absolute top-2 right-2 px-1.5 py-0.5 text-xs font-medium bg-success text-white rounded">
            Discover
          </div>
        )}
      </div>

      <div className="p-3">
        <p className="text-xs font-medium text-text-primary truncate">{asset.original_filename}</p>
        <div className="flex items-center gap-2 mt-1 text-xs text-text-muted">
          {asset.width_px && asset.height_px && (
            <span>{asset.width_px}×{asset.height_px}</span>
          )}
          {fileSizeKB && <span>{fileSizeKB}KB</span>}
        </div>

        <div className="flex items-center gap-1 mt-2">
          <button
            onClick={handleCopy}
            className="flex-1 text-xs py-1 border border-border hover:border-border-strong rounded text-text-secondary hover:text-text-primary transition-colors"
          >
            {copied ? 'Copied!' : 'Copy URL'}
          </button>
          <button
            onClick={onDelete}
            className="text-xs px-2 py-1 border border-border hover:border-danger hover:text-danger rounded transition-colors text-text-muted"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  )
}
