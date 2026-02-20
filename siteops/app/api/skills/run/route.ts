import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { inngest } from '@/lib/inngest/client'
import { z } from 'zod'

const schema = z.object({
  siteId: z.string().uuid(),
  skillId: z.string().uuid(),
})

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: any
  const contentType = req.headers.get('content-type') ?? ''

  if (contentType.includes('application/json')) {
    body = await req.json()
  } else {
    const formData = await req.formData()
    body = Object.fromEntries(formData.entries())
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { siteId, skillId } = parsed.data

  // Verify site ownership
  const { data: site } = await supabase
    .from('sites')
    .select('id, owner_id')
    .eq('id', siteId)
    .eq('owner_id', user.id)
    .single()

  if (!site) {
    return NextResponse.json({ error: 'Site not found' }, { status: 404 })
  }

  // Get skill slug
  const { data: skill } = await supabase
    .from('skills')
    .select('slug')
    .eq('id', skillId)
    .single()

  if (!skill) {
    return NextResponse.json({ error: 'Skill not found' }, { status: 404 })
  }

  // Send event to Inngest
  await inngest.send({
    name: 'skill/run',
    data: {
      siteId,
      skillId,
      skillSlug: skill.slug,
      triggeredBy: 'manual',
    },
  })

  return NextResponse.json({ success: true, message: 'Skill run queued' })
}
