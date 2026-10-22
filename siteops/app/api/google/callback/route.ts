import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { google } from 'googleapis'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  const stateParam = searchParams.get('state')
  const error = searchParams.get('error')

  if (error) {
    return NextResponse.redirect(new URL('/dashboard?error=google_auth_denied', req.url))
  }

  if (!code || !stateParam) {
    return NextResponse.redirect(new URL('/dashboard?error=google_auth_invalid', req.url))
  }

  // Validate state to prevent CSRF
  let state: { siteId: string; userId: string; nonce: string; ts: number }
  try {
    state = JSON.parse(Buffer.from(stateParam, 'base64url').toString())
  } catch {
    return NextResponse.redirect(new URL('/dashboard?error=google_auth_invalid_state', req.url))
  }

  // State should be less than 10 minutes old
  if (Date.now() - state.ts > 10 * 60 * 1000) {
    return NextResponse.redirect(new URL('/dashboard?error=google_auth_expired', req.url))
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.id !== state.userId) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID!,
    process.env.GOOGLE_CLIENT_SECRET!,
    process.env.GOOGLE_REDIRECT_URI!
  )

  const { tokens } = await oauth2Client.getToken(code)

  const adminClient = createAdminClient()
  const { error: tokenError } = await adminClient
    .from('site_tokens')
    .upsert({
      site_id: state.siteId,
      token_type: 'google_oauth',
      access_token: tokens.access_token!,
      refresh_token: tokens.refresh_token ?? null,
      expires_at: tokens.expiry_date
        ? new Date(tokens.expiry_date).toISOString()
        : null,
      scopes: tokens.scope?.split(' ') ?? [],
      updated_at: new Date().toISOString(),
    }, { onConflict: 'site_id,token_type' })

  if (tokenError) {
    console.error('Failed to save Google token:', tokenError)
    return NextResponse.redirect(
      new URL(`/dashboard/sites/${state.siteId}/settings?error=token_save_failed`, req.url)
    )
  }

  // Audit log
  await supabase.from('audit_log').insert({
    site_id: state.siteId,
    user_id: user.id,
    action: 'google_connected',
    details: { scopes: tokens.scope?.split(' ') },
  })

  return NextResponse.redirect(
    new URL(`/dashboard/sites/${state.siteId}/settings?success=google_connected`, req.url)
  )
}
