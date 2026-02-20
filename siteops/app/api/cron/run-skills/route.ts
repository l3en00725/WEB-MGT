import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { inngest } from '@/lib/inngest/client'

export async function GET(req: NextRequest) {
  // Validate cron secret
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const adminClient = createAdminClient()
  const now = new Date().toISOString()

  // Find all active site_skills that are due to run
  const { data: dueSkills } = await adminClient
    .from('site_skills')
    .select('*, skills(slug), sites(id, owner_id, status)')
    .eq('is_active', true)
    .lte('next_run_at', now)

  if (!dueSkills?.length) {
    return NextResponse.json({ message: 'No skills due to run', count: 0 })
  }

  // Filter to active sites
  const activeDue = dueSkills.filter((ss: any) => ss.sites?.status === 'active')

  // Send Inngest events
  const events = activeDue.map((ss: any) => ({
    name: 'skill/run' as const,
    data: {
      siteId: ss.site_id,
      skillId: ss.skill_id,
      skillSlug: ss.skills?.slug ?? '',
      triggeredBy: 'cron' as const,
    },
  }))

  if (events.length > 0) {
    await inngest.send(events)
  }

  // Update next_run_at for triggered skills
  // Parse cron and compute next run (simplified: add 7 days for weekly, 1 day for daily)
  const updates = activeDue.map((ss: any) => {
    const nextRun = new Date(now)
    nextRun.setDate(nextRun.getDate() + 7) // default weekly

    return adminClient
      .from('site_skills')
      .update({ next_run_at: nextRun.toISOString() })
      .eq('id', ss.id)
  })

  await Promise.all(updates)

  return NextResponse.json({
    message: `Triggered ${events.length} skill runs`,
    count: events.length,
  })
}
