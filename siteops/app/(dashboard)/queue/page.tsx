import { createClient } from '@/lib/supabase/server'
import QueueClient from '@/components/dashboard/QueueClient'

export default async function QueuePage() {
  const supabase = await createClient()

  const [{ data: sites }, { data: skills }] = await Promise.all([
    supabase.from('sites').select('id, name, domain').order('name'),
    supabase.from('skills').select('id, name, slug, icon').order('name'),
  ])

  return <QueueClient sites={sites ?? []} skills={skills ?? []} />
}
