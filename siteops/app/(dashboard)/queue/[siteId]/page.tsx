import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import QueueClient from '@/components/dashboard/QueueClient'

export default async function SiteQueuePage({ params }: { params: { siteId: string } }) {
  const supabase = createClient()

  const [{ data: sites }, { data: skills }, { data: site }] = await Promise.all([
    supabase.from('sites').select('id, name, domain').order('name'),
    supabase.from('skills').select('id, name, slug, icon').order('name'),
    supabase.from('sites').select('id, name').eq('id', params.siteId).single(),
  ])

  if (!site) notFound()

  return <QueueClient sites={sites ?? []} skills={skills ?? []} defaultSiteId={params.siteId} />
}
