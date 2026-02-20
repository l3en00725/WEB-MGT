'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/client'

const siteSchema = z.object({
  name: z.string().min(1, 'Site name is required'),
  domain: z.string().min(1, 'Domain is required').regex(/^[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)+$/, 'Invalid domain format'),
  github_owner: z.string().min(1, 'GitHub owner is required'),
  github_repo: z.string().min(1, 'GitHub repo is required'),
  github_default_branch: z.string().min(1).optional(),
  vercel_project_id: z.string().optional(),
  vercel_team_id: z.string().optional(),
  gsc_property: z.string().optional(),
  ga4_property_id: z.string().optional(),
})

type SiteFormData = z.infer<typeof siteSchema>

export default function NewSitePage() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SiteFormData>({
    resolver: zodResolver(siteSchema) as any,
    defaultValues: { github_default_branch: 'main' },
  })

  async function onSubmit(data: SiteFormData) {
    setError(null)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: site, error: siteError } = await supabase
      .from('sites')
      .insert({
        owner_id: user.id,
        name: data.name,
        domain: data.domain,
        github_owner: data.github_owner,
        github_repo: data.github_repo,
        github_default_branch: data.github_default_branch || 'main',
        vercel_project_id: data.vercel_project_id || null,
        vercel_team_id: data.vercel_team_id || null,
        gsc_property: data.gsc_property || null,
        ga4_property_id: data.ga4_property_id || null,
      })
      .select()
      .single()

    if (siteError) {
      setError(siteError.message)
      return
    }

    // Add all available skills to site_skills
    const { data: skills } = await supabase.from('skills').select('id')
    if (skills?.length && site) {
      await supabase.from('site_skills').insert(
        skills.map(skill => ({
          site_id: site.id,
          skill_id: skill.id,
          is_active: true,
        }))
      )
    }

    router.push(`/dashboard/sites/${site.id}/settings`)
  }

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-text-primary">Add site</h1>
        <p className="text-sm text-text-secondary mt-1">Connect a Next.js website to SiteOps</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit as any)} className="space-y-6">
        {/* Basic info */}
        <section className="bg-background border border-border rounded-lg p-5 space-y-4">
          <h2 className="text-sm font-semibold text-text-primary">Basic information</h2>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Site name" error={errors.name?.message}>
              <input
                {...register('name')}
                placeholder="Acme Corp"
                className="input"
              />
            </Field>
            <Field label="Domain" error={errors.domain?.message}>
              <input
                {...register('domain')}
                placeholder="acmecorp.com"
                className="input"
              />
            </Field>
          </div>
        </section>

        {/* GitHub */}
        <section className="bg-background border border-border rounded-lg p-5 space-y-4">
          <h2 className="text-sm font-semibold text-text-primary">GitHub repository</h2>

          <div className="grid grid-cols-2 gap-4">
            <Field label="GitHub owner" error={errors.github_owner?.message}>
              <input
                {...register('github_owner')}
                placeholder="acmecorp"
                className="input"
              />
            </Field>
            <Field label="GitHub repo" error={errors.github_repo?.message}>
              <input
                {...register('github_repo')}
                placeholder="website"
                className="input"
              />
            </Field>
          </div>
          <Field label="Default branch" error={errors.github_default_branch?.message}>
            <input
              {...register('github_default_branch')}
              placeholder="main"
              className="input"
            />
          </Field>
        </section>

        {/* Vercel */}
        <section className="bg-background border border-border rounded-lg p-5 space-y-4">
          <h2 className="text-sm font-semibold text-text-primary">Vercel <span className="text-text-muted font-normal">(optional)</span></h2>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Project ID">
              <input
                {...register('vercel_project_id')}
                placeholder="prj_xxxxxxxxxxxx"
                className="input"
              />
            </Field>
            <Field label="Team ID">
              <input
                {...register('vercel_team_id')}
                placeholder="team_xxxxxxxxxxxx"
                className="input"
              />
            </Field>
          </div>
        </section>

        {/* Google */}
        <section className="bg-background border border-border rounded-lg p-5 space-y-4">
          <h2 className="text-sm font-semibold text-text-primary">Google <span className="text-text-muted font-normal">(configure after adding site)</span></h2>

          <div className="grid grid-cols-2 gap-4">
            <Field label="GSC property">
              <input
                {...register('gsc_property')}
                placeholder="sc-domain:acmecorp.com"
                className="input"
              />
            </Field>
            <Field label="GA4 property ID">
              <input
                {...register('ga4_property_id')}
                placeholder="properties/123456789"
                className="input"
              />
            </Field>
          </div>
          <p className="text-xs text-text-muted">
            You&apos;ll connect your Google account on the site settings page after creating the site.
          </p>
        </section>

        {error && (
          <div className="p-3 text-sm text-danger bg-red-50 border border-red-200 rounded-md">
            {error}
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-5 py-2 bg-accent hover:bg-accent-hover text-white text-sm font-medium rounded-md transition-colors disabled:opacity-50"
          >
            {isSubmitting ? 'Adding...' : 'Add site'}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}

function Field({
  label,
  error,
  children,
}: {
  label: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-text-primary mb-1.5">{label}</label>
      {children}
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  )
}
