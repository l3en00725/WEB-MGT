import { google } from 'googleapis'
import { createAdminClient } from '@/lib/supabase/admin'

async function getGoogleAuth(siteId: string) {
  const adminClient = createAdminClient()
  const { data: token } = await adminClient
    .from('site_tokens')
    .select('*')
    .eq('site_id', siteId)
    .eq('token_type', 'google_oauth')
    .single()

  if (!token) throw new Error('Google not connected for this site')

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID!,
    process.env.GOOGLE_CLIENT_SECRET!,
    process.env.GOOGLE_REDIRECT_URI!
  )

  oauth2Client.setCredentials({
    access_token: token.access_token,
    refresh_token: token.refresh_token,
    expiry_date: token.expires_at ? new Date(token.expires_at).getTime() : undefined,
  })

  // Auto-refresh if expired or expiring within 5 minutes
  const expiresAt = token.expires_at ? new Date(token.expires_at).getTime() : 0
  if (expiresAt > 0 && Date.now() > expiresAt - 5 * 60 * 1000) {
    const { credentials } = await oauth2Client.refreshAccessToken()
    oauth2Client.setCredentials(credentials)

    // Save refreshed token
    await adminClient
      .from('site_tokens')
      .update({
        access_token: credentials.access_token!,
        expires_at: credentials.expiry_date
          ? new Date(credentials.expiry_date).toISOString()
          : null,
        updated_at: new Date().toISOString(),
      })
      .eq('site_id', siteId)
      .eq('token_type', 'google_oauth')
  }

  return oauth2Client
}

export interface GSCPageMetrics {
  page: string
  clicks: number
  impressions: number
  ctr: number
  position: number
}

export interface GSCQueryMetrics {
  query: string
  clicks: number
  impressions: number
  ctr: number
  position: number
}

export async function getGSCSearchPerformance(
  siteId: string,
  gscProperty: string,
  startDate: string,
  endDate: string,
  dimensions: string[] = ['page'],
  searchType: string = 'web',
  rowLimit: number = 20
): Promise<GSCPageMetrics[]> {
  const auth = await getGoogleAuth(siteId)
  const searchconsole = google.searchconsole({ version: 'v1', auth })

  const { data } = await searchconsole.searchanalytics.query({
    siteUrl: gscProperty,
    requestBody: {
      startDate,
      endDate,
      dimensions,
      type: searchType as any,
      rowLimit,
      dataState: 'all',
    },
  })

  return (data.rows ?? []).map(row => ({
    page: row.keys?.[0] ?? '',
    clicks: row.clicks ?? 0,
    impressions: row.impressions ?? 0,
    ctr: row.ctr ?? 0,
    position: row.position ?? 0,
  }))
}

export async function getGSCQueryPerformance(
  siteId: string,
  gscProperty: string,
  page: string,
  startDate: string,
  endDate: string
): Promise<GSCQueryMetrics[]> {
  const auth = await getGoogleAuth(siteId)
  const searchconsole = google.searchconsole({ version: 'v1', auth })

  const { data } = await searchconsole.searchanalytics.query({
    siteUrl: gscProperty,
    requestBody: {
      startDate,
      endDate,
      dimensions: ['query'],
      dimensionFilterGroups: [
        {
          filters: [
            { dimension: 'page', operator: 'equals', expression: page },
          ],
        },
      ],
      rowLimit: 10,
    },
  })

  return (data.rows ?? []).map(row => ({
    query: row.keys?.[0] ?? '',
    clicks: row.clicks ?? 0,
    impressions: row.impressions ?? 0,
    ctr: row.ctr ?? 0,
    position: row.position ?? 0,
  }))
}

export async function getGA4PageMetrics(
  siteId: string,
  propertyId: string,
  startDate: string,
  endDate: string,
  minSessions: number = 200
) {
  const auth = await getGoogleAuth(siteId)
  const analyticsdata = google.analyticsdata({ version: 'v1beta', auth })

  const response = await analyticsdata.properties.runReport({
    property: propertyId,
    requestBody: {
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: 'pagePath' }],
      metrics: [
        { name: 'sessions' },
        { name: 'bounceRate' },
        { name: 'averageSessionDuration' },
        { name: 'screenPageViews' },
      ],
      orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
      limit: '50',
    },
  })

  const data = response.data
  return ((data as any).rows ?? [])
    .map((row: any) => ({
      page: row.dimensionValues?.[0]?.value ?? '',
      sessions: parseInt(row.metricValues?.[0]?.value ?? '0'),
      bounceRate: parseFloat(row.metricValues?.[1]?.value ?? '0'),
      avgEngagementTime: parseFloat(row.metricValues?.[2]?.value ?? '0'),
      pageViews: parseInt(row.metricValues?.[3]?.value ?? '0'),
    }))
    .filter((row: any) => row.sessions >= minSessions)
}

export async function getDiscoverPerformance(
  siteId: string,
  gscProperty: string,
  startDate: string,
  endDate: string
): Promise<GSCPageMetrics[]> {
  return getGSCSearchPerformance(
    siteId,
    gscProperty,
    startDate,
    endDate,
    ['page'],
    'DISCOVER',
    20
  )
}
