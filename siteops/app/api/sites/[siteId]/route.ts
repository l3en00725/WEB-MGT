import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { z } from 'zod'

const updateSiteSchema = z.object({
  name: z.string().min(1).optional(),
  domain: z.string().optional(),
  github_owner: z.string().optional(),
  github_repo: z.string().optional(),
  github_default_branch: z.string().optional(),
  vercel_project_id: z.string().nullable().optional(),
  vercel_team_id: z.string().nullable().optional(),
  gsc_property: z.string().nullable().optional(),
  ga4_property_id: z.string().nullable().optional(),
  status: z.enum(['active', 'paused']).optional(),
  // For token updates
  tokenType: z.enum(['github', 'vercel', 'google_oauth', 'keywords_everywhere']).optional(),
  accessToken: z.string().optional(),
})

export async function GET(_req: NextRequest, props: { params: Promise<{ siteId: string }> }) {
  const params = await props.params;
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('sites')
    .select('*')
    .eq('id', params.siteId)
    .single()

  if (error) return NextResponse.json({ error: 'Site not found' }, { status: 404 })
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest, props: { params: Promise<{ siteId: string }> }) {
  const params = await props.params;
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Verify ownership
  const { data: site } = await supabase
    .from('sites')
    .select('id, owner_id')
    .eq('id', params.siteId)
    .single()

  if (!site || site.owner_id !== user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const body = await req.json()
  const parsed = updateSiteSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { tokenType, accessToken, ...siteUpdates } = parsed.data

  // Handle token update
  if (tokenType && accessToken) {
    const adminClient = createAdminClient()
    const { error: tokenError } = await adminClient
      .from('site_tokens')
      .upsert({
        site_id: params.siteId,
        token_type: tokenType,
        access_token: accessToken,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'site_id,token_type' })

    if (tokenError) return NextResponse.json({ error: tokenError.message }, { status: 500 })
  }

  // Handle site updates
  if (Object.keys(siteUpdates).length > 0) {
    const { error } = await supabase
      .from('sites')
      .update({ ...siteUpdates, updated_at: new Date().toISOString() })
      .eq('id', params.siteId)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}

export async function DELETE(_req: NextRequest, props: { params: Promise<{ siteId: string }> }) {
  const params = await props.params;
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { error } = await supabase
    .from('sites')
    .delete()
    .eq('id', params.siteId)
    .eq('owner_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Audit log
  await supabase.from('audit_log').insert({
    user_id: user.id,
    action: 'site_deleted',
    details: { site_id: params.siteId },
  })

  return NextResponse.json({ success: true })
}
