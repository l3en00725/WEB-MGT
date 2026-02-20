'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/client'

const settingsSchema = z.object({
  name: z.string().min(1),
  domain: z.string().min(1),
  github_owner: z.string().min(1),
  github_repo: z.string().min(1),
  github_default_branch: z.string().min(1),
  vercel_project_id: z.string().optional(),
  vercel_team_id: z.string().optional(),
  gsc_property: z.string().optional(),
  ga4_property_id: z.string().optional(),
})

type SettingsFormData = z.infer<typeof settingsSchema>

export default function SiteSettingsPage() {
  const params = useParams<{ siteId: string }>()
  const router = useRouter()
  const supabase = createClient()

  const [site, setSite] = useState<any>(null)
  const [tokens, setTokens] = useState<Record<string, boolean>>({})
  const [githubToken, setGithubToken] = useState('')
  const [vercelToken, setVercelToken] = useState('')
  const [saving, setSaving] = useState(false)
  const [savingToken, setSavingToken] = useState<string | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const { register, handleSubmit, reset, formState: { errors } } = useForm<SettingsFormData>({
    resolver: zodResolver(settingsSchema),
  })

  useEffect(() => {
    async function load() {
      const { data: siteData } = await supabase.from('sites').select('*').eq('id', params.siteId).single()
      if (siteData) {
        setSite(siteData)
        reset({
          name: siteData.name,
          domain: siteData.domain,
          github_owner: siteData.github_owner,
          github_repo: siteData.github_repo,
          github_default_branch: siteData.github_default_branch,
          vercel_project_id: siteData.vercel_project_id ?? undefined,
          vercel_team_id: siteData.vercel_team_id ?? undefined,
          gsc_property: siteData.gsc_property ?? undefined,
          ga4_property_id: siteData.ga4_property_id ?? undefined,
        })
      }
      const { data: tokenData } = await supabase
        .from('site_tokens')
        .select('token_type')
        .eq('site_id', params.siteId)
      const tokenMap: Record<string, boolean> = {}
      tokenData?.forEach(t => { tokenMap[t.token_type] = true })
      setTokens(tokenMap)
    }
    load()
  }, [params.siteId])

  async function onSubmit(data: SettingsFormData) {
    setSaving(true)
    setMessage(null)
    const { error } = await supabase
      .from('sites')
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq('id', params.siteId)

    if (error) {
      setMessage({ type: 'error', text: error.message })
    } else {
      setMessage({ type: 'success', text: 'Settings saved' })
    }
    setSaving(false)
  }

  async function saveToken(tokenType: string, accessToken: string) {
    if (!accessToken.trim()) return
    setSavingToken(tokenType)
    setMessage(null)
    const res = await fetch(`/api/sites/${params.siteId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tokenType, accessToken }),
    })
    if (res.ok) {
      setTokens(prev => ({ ...prev, [tokenType]: true }))
      setMessage({ type: 'success', text: `${tokenType} token saved` })
      if (tokenType === 'github') setGithubToken('')
      if (tokenType === 'vercel') setVercelToken('')
    } else {
      setMessage({ type: 'error', text: 'Failed to save token' })
    }
    setSavingToken(null)
  }

  async function connectGoogle() {
    window.location.href = `/api/sites/${params.siteId}/connect-google`
  }

  async function handleDelete() {
    if (!confirm(`Delete site "${site?.name}"? This cannot be undone.`)) return
    await supabase.from('sites').delete().eq('id', params.siteId)
    router.push('/dashboard/sites')
  }

  if (!site) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-surface rounded w-48" />
          <div className="h-64 bg-surface rounded" />
        </div>
      </div>
    )
  }

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-text-primary">Settings</h1>
        <p className="text-sm text-text-secondary mt-1">{site.name}</p>
      </div>

      {message && (
        <div className={`mb-4 p-3 text-sm rounded-md ${
          message.type === 'success'
            ? 'bg-green-50 text-success border border-green-200'
            : 'bg-red-50 text-danger border border-red-200'
        }`}>
          {message.text}
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Basic info */}
        <section className="bg-background border border-border rounded-lg p-5 space-y-4">
          <h2 className="text-sm font-semibold text-text-primary">Basic information</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1.5">Site name</label>
              <input {...register('name')} className="input" />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1.5">Domain</label>
              <input {...register('domain')} className="input" />
            </div>
          </div>
        </section>

        {/* GitHub */}
        <section className="bg-background border border-border rounded-lg p-5 space-y-4">
          <h2 className="text-sm font-semibold text-text-primary">GitHub</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1.5">Owner</label>
              <input {...register('github_owner')} className="input" />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1.5">Repository</label>
              <input {...register('github_repo')} className="input" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1.5">Default branch</label>
            <input {...register('github_default_branch')} className="input" />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1.5">
              Personal Access Token
              {tokens.github && <span className="ml-2 text-xs text-success">Connected</span>}
            </label>
            <div className="flex gap-2">
              <input
                type="password"
                value={githubToken}
                onChange={e => setGithubToken(e.target.value)}
                placeholder={tokens.github ? '••••••••••••' : 'ghp_xxxxxxxxxxxx'}
                className="input flex-1"
              />
              <button
                type="button"
                disabled={!githubToken || savingToken === 'github'}
                onClick={() => saveToken('github', githubToken)}
                className="px-4 py-2 text-sm bg-accent hover:bg-accent-hover text-white rounded-md disabled:opacity-50 transition-colors"
              >
                {savingToken === 'github' ? 'Saving...' : 'Save'}
              </button>
            </div>
            <p className="text-xs text-text-muted mt-1">Requires repo and workflow scopes</p>
          </div>
        </section>

        {/* Vercel */}
        <section className="bg-background border border-border rounded-lg p-5 space-y-4">
          <h2 className="text-sm font-semibold text-text-primary">Vercel</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1.5">Project ID</label>
              <input {...register('vercel_project_id')} placeholder="prj_xxxxxxxxxxxx" className="input" />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1.5">Team ID</label>
              <input {...register('vercel_team_id')} placeholder="team_xxxxxxxxxxxx (optional)" className="input" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1.5">
              Access Token
              {tokens.vercel && <span className="ml-2 text-xs text-success">Connected</span>}
            </label>
            <div className="flex gap-2">
              <input
                type="password"
                value={vercelToken}
                onChange={e => setVercelToken(e.target.value)}
                placeholder={tokens.vercel ? '••••••••••••' : 'your-vercel-token'}
                className="input flex-1"
              />
              <button
                type="button"
                disabled={!vercelToken || savingToken === 'vercel'}
                onClick={() => saveToken('vercel', vercelToken)}
                className="px-4 py-2 text-sm bg-accent hover:bg-accent-hover text-white rounded-md disabled:opacity-50 transition-colors"
              >
                {savingToken === 'vercel' ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </section>

        {/* Google */}
        <section className="bg-background border border-border rounded-lg p-5 space-y-4">
          <h2 className="text-sm font-semibold text-text-primary">Google (GSC + GA4)</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1.5">GSC property</label>
              <input {...register('gsc_property')} placeholder="sc-domain:example.com" className="input" />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1.5">GA4 property ID</label>
              <input {...register('ga4_property_id')} placeholder="properties/123456789" className="input" />
            </div>
          </div>
          <div className="flex items-center gap-3">
            {tokens.google_oauth ? (
              <div className="flex items-center gap-2">
                <span className="text-sm text-success">Google account connected</span>
                <button
                  type="button"
                  onClick={connectGoogle}
                  className="text-sm text-text-muted hover:text-text-primary underline"
                >
                  Reconnect
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={connectGoogle}
                className="px-4 py-2 text-sm border border-border hover:border-border-strong rounded-md text-text-primary hover:bg-surface-hover transition-colors"
              >
                Connect Google account
              </button>
            )}
          </div>
        </section>

        <div className="flex items-center justify-between">
          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2 bg-accent hover:bg-accent-hover text-white text-sm font-medium rounded-md transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save settings'}
          </button>
          <button
            type="button"
            onClick={handleDelete}
            className="text-sm text-danger hover:underline"
          >
            Delete site
          </button>
        </div>
      </form>
    </div>
  )
}
