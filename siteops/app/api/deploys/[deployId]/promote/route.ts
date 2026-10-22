import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { promoteToProduction } from '@/lib/vercel'

export async function POST(_req: NextRequest, props: { params: Promise<{ deployId: string }> }) {
  const params = await props.params;
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: deploy } = await supabase
    .from('deploys')
    .select('*, sites(vercel_project_id, vercel_team_id)')
    .eq('id', params.deployId)
    .single()

  if (!deploy) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (deploy.status !== 'preview_ready') {
    return NextResponse.json({ error: 'Deploy is not in preview_ready state' }, { status: 400 })
  }

  if (!deploy.vercel_deployment_id) {
    return NextResponse.json({ error: 'No Vercel deployment ID' }, { status: 400 })
  }

  try {
    const site = deploy.sites as any
    const result = await promoteToProduction(
      deploy.site_id,
      deploy.vercel_deployment_id,
      site?.vercel_team_id ?? null
    )

    const adminClient = createAdminClient()
    await adminClient
      .from('deploys')
      .update({
        status: 'promoted',
        promoted_at: new Date().toISOString(),
        vercel_production_url: deploy.vercel_preview_url,
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.deployId)

    // Audit log
    await supabase.from('audit_log').insert({
      site_id: deploy.site_id,
      user_id: user.id,
      action: 'deploy_promoted',
      details: {
        deploy_id: params.deployId,
        vercel_deployment_id: deploy.vercel_deployment_id,
        production_url: deploy.vercel_preview_url,
      },
    })

    return NextResponse.json({ success: true, status: 'promoted' })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
