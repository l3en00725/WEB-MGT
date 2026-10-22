import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'

const schema = z.object({
  action: z.enum(['approved', 'rejected']),
})

export async function PATCH(req: NextRequest, props: { params: Promise<{ resultId: string }> }) {
  const params = await props.params;
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { action } = parsed.data

  // Get the result and verify ownership via site
  const { data: result } = await supabase
    .from('skill_results')
    .select('id, site_id, status')
    .eq('id', params.resultId)
    .single()

  if (!result) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (result.status !== 'pending') {
    return NextResponse.json({ error: 'Already reviewed' }, { status: 409 })
  }

  // Update status
  const { error } = await supabase
    .from('skill_results')
    .update({
      status: action,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', params.resultId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Audit log
  await supabase.from('audit_log').insert({
    site_id: result.site_id,
    user_id: user.id,
    action: action === 'approved' ? 'change_approved' : 'change_rejected',
    details: { result_id: params.resultId },
  })

  return NextResponse.json({ success: true, status: action })
}
