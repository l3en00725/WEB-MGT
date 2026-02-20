import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import MediaLibraryClient from '@/components/dashboard/MediaLibraryClient'

export default async function MediaLibraryPage({
  params,
}: {
  params: { siteId: string }
}) {
  const supabase = createClient()

  const { data: site } = await supabase
    .from('sites')
    .select('id, name, domain')
    .eq('id', params.siteId)
    .single()

  if (!site) notFound()

  const { data: assets } = await supabase
    .from('media_assets')
    .select('*')
    .eq('site_id', params.siteId)
    .order('created_at', { ascending: false })

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-text-primary">Media Library</h1>
        <p className="text-sm text-text-secondary mt-1">{site.name}</p>
      </div>

      <MediaLibraryClient siteId={params.siteId} initialAssets={assets ?? []} />
    </div>
  )
}
