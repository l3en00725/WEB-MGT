import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { google } from 'googleapis'

export async function GET(req: NextRequest, props: { params: Promise<{ siteId: string }> }) {
  const params = await props.params;
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  // Verify site ownership
  const { data: site } = await supabase
    .from('sites')
    .select('id')
    .eq('id', params.siteId)
    .eq('owner_id', user.id)
    .single()

  if (!site) {
    return NextResponse.json({ error: 'Site not found' }, { status: 404 })
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID!,
    process.env.GOOGLE_CLIENT_SECRET!,
    process.env.GOOGLE_REDIRECT_URI!
  )

  // State encodes siteId + a random nonce for CSRF protection
  const state = Buffer.from(JSON.stringify({
    siteId: params.siteId,
    userId: user.id,
    nonce: Math.random().toString(36).slice(2),
    ts: Date.now(),
  })).toString('base64url')

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/webmasters.readonly',
      'https://www.googleapis.com/auth/analytics.readonly',
    ],
    state,
    prompt: 'consent', // force refresh_token issuance
  })

  return NextResponse.redirect(authUrl)
}
