import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { siteId: string; assetId: string } }
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Verify ownership
  const { data: asset } = await supabase
    .from('media_assets')
    .select('id, storage_path')
    .eq('id', params.assetId)
    .eq('site_id', params.siteId)
    .single()

  if (!asset) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const adminClient = createAdminClient()

  // Delete from storage
  const baseId = asset.storage_path.replace('.webp', '').split('/').pop()
  const variantPaths = [
    asset.storage_path,
    asset.storage_path.replace('.webp', '-1200x630.webp'),
    asset.storage_path.replace('.webp', '-400x300.webp'),
  ]

  await adminClient.storage.from('site-media').remove(variantPaths)

  // Delete from database
  const { error } = await adminClient
    .from('media_assets')
    .delete()
    .eq('id', params.assetId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
