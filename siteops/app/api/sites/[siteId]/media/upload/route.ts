import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import sharp from 'sharp'
import { randomUUID } from 'crypto'

const OPTIMIZATION_CONFIG = {
  webp: { quality: 82, effort: 4 as const },
  discoverVariant: { width: 1200, height: 630, fit: 'cover' as const, position: 'centre' as const },
  thumbnailVariant: { width: 400, height: 300, fit: 'cover' as const },
  maxFileSizeBytes: 10 * 1024 * 1024, // 10MB
}

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml']

export async function POST(req: NextRequest, props: { params: Promise<{ siteId: string }> }) {
  const params = await props.params;
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Verify site ownership
  const { data: site } = await supabase
    .from('sites')
    .select('id')
    .eq('id', params.siteId)
    .eq('owner_id', user.id)
    .single()

  if (!site) return NextResponse.json({ error: 'Site not found' }, { status: 404 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null

  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: 'Invalid file type' }, { status: 400 })
  }

  if (file.size > OPTIMIZATION_CONFIG.maxFileSizeBytes) {
    return NextResponse.json({ error: 'File exceeds 10MB limit' }, { status: 400 })
  }

  const buffer = Buffer.from(await file.arrayBuffer())

  // SVG — store as-is
  if (file.type === 'image/svg+xml') {
    const filename = `${randomUUID()}.svg`
    const storagePath = `sites/${params.siteId}/${filename}`
    const adminClient = createAdminClient()

    const { error: uploadError } = await adminClient.storage
      .from('site-media')
      .upload(storagePath, buffer, { contentType: 'image/svg+xml' })

    if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 })

    const { data: { publicUrl } } = adminClient.storage
      .from('site-media')
      .getPublicUrl(storagePath)

    const { data: asset } = await adminClient.from('media_assets').insert({
      site_id: params.siteId,
      owner_id: user.id,
      filename,
      original_filename: file.name,
      storage_path: storagePath,
      public_url: publicUrl,
      mime_type: 'image/svg+xml',
      file_size_bytes: buffer.length,
      is_discover_eligible: false,
    }).select().single()

    return NextResponse.json(asset, { status: 201 })
  }

  // Process with Sharp
  const image = sharp(buffer)
  const metadata = await image.metadata()

  const originalWidth = metadata.width ?? 0
  const originalHeight = metadata.height ?? 0

  // Convert to WebP
  const optimizedBuffer = await sharp(buffer)
    .webp(OPTIMIZATION_CONFIG.webp)
    .toBuffer()

  // Generate Discover-optimized variant (1200x630)
  const discoverBuffer = await sharp(buffer)
    .resize({
      width: OPTIMIZATION_CONFIG.discoverVariant.width,
      height: OPTIMIZATION_CONFIG.discoverVariant.height,
      fit: OPTIMIZATION_CONFIG.discoverVariant.fit,
      position: OPTIMIZATION_CONFIG.discoverVariant.position,
      withoutEnlargement: true,
    })
    .webp(OPTIMIZATION_CONFIG.webp)
    .toBuffer()

  // Generate thumbnail
  const thumbnailBuffer = await sharp(buffer)
    .resize({
      width: OPTIMIZATION_CONFIG.thumbnailVariant.width,
      height: OPTIMIZATION_CONFIG.thumbnailVariant.height,
      fit: OPTIMIZATION_CONFIG.thumbnailVariant.fit,
      withoutEnlargement: true,
    })
    .webp(OPTIMIZATION_CONFIG.webp)
    .toBuffer()

  const baseId = randomUUID()
  const adminClient = createAdminClient()

  // Upload all 3 variants
  const uploads = [
    { buffer: optimizedBuffer, suffix: '', width: originalWidth, height: originalHeight },
    { buffer: discoverBuffer, suffix: '-1200x630', width: 1200, height: 630 },
    { buffer: thumbnailBuffer, suffix: '-400x300', width: 400, height: 300 },
  ]

  for (const upload of uploads) {
    const filename = `${baseId}${upload.suffix}.webp`
    const storagePath = `sites/${params.siteId}/${filename}`
    const { error } = await adminClient.storage
      .from('site-media')
      .upload(storagePath, upload.buffer, { contentType: 'image/webp' })
    if (error) {
      console.error(`Failed to upload variant ${upload.suffix}:`, error)
    }
  }

  // Get public URL for main file
  const mainFilename = `${baseId}.webp`
  const mainStoragePath = `sites/${params.siteId}/${mainFilename}`
  const { data: { publicUrl } } = adminClient.storage
    .from('site-media')
    .getPublicUrl(mainStoragePath)

  const isDiscoverEligible = originalWidth >= 1200

  const { data: asset } = await adminClient
    .from('media_assets')
    .insert({
      site_id: params.siteId,
      owner_id: user.id,
      filename: mainFilename,
      original_filename: file.name,
      storage_path: mainStoragePath,
      public_url: publicUrl,
      mime_type: 'image/webp',
      width_px: originalWidth,
      height_px: originalHeight,
      file_size_bytes: optimizedBuffer.length,
      is_discover_eligible: isDiscoverEligible,
    })
    .select()
    .single()

  return NextResponse.json(asset, { status: 201 })
}
