import { createAdminClient } from '@/lib/supabase/admin'
import { google } from 'googleapis'

const ADS_API_BASE = 'https://googleads.googleapis.com/v18'

// ─── Auth ──────────────────────────────────────────────────────────────────

async function getAdsAccessToken(siteId: string): Promise<string> {
  const adminClient = createAdminClient()
  const { data: token } = await adminClient
    .from('site_tokens')
    .select('*')
    .eq('site_id', siteId)
    .eq('token_type', 'google_ads')
    .single()

  if (!token) throw new Error('Google Ads not connected for this site')

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
      .eq('token_type', 'google_ads')
  }

  const { token: accessToken } = await oauth2Client.getAccessToken()
  return accessToken!
}

// ─── GAQL query helper ─────────────────────────────────────────────────────

async function gaqlQuery(
  siteId: string,
  customerId: string,
  query: string
): Promise<any[]> {
  const accessToken = await getAdsAccessToken(siteId)
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN

  if (!developerToken) throw new Error('GOOGLE_ADS_DEVELOPER_TOKEN not set')

  // Strip dashes from customer ID (Google accepts both formats)
  const cleanCustomerId = customerId.replace(/-/g, '')

  const res = await fetch(`${ADS_API_BASE}/customers/${cleanCustomerId}/googleAds:search`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'developer-token': developerToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Google Ads API error ${res.status}: ${err}`)
  }

  const data = await res.json()
  return data.results ?? []
}

// ─── Types ─────────────────────────────────────────────────────────────────

export interface AdsCampaignMetrics {
  campaignId: string
  campaignName: string
  status: string
  impressions: number
  clicks: number
  conversions: number
  costMicros: number
  ctr: number
  avgCpc: number
}

export interface AdsKeywordMetrics {
  keywordText: string
  matchType: string
  campaignName: string
  adGroupName: string
  qualityScore: number | null
  expectedCtr: string | null       // ABOVE_AVERAGE | AVERAGE | BELOW_AVERAGE
  adRelevance: string | null
  landingPageExperience: string | null
  impressions: number
  clicks: number
  conversions: number
  costMicros: number
  avgCpc: number
}

export interface AdsSearchTermMetrics {
  searchTerm: string
  matchType: string
  campaignName: string
  impressions: number
  clicks: number
  conversions: number
  costMicros: number
  ctr: number
}

// ─── API functions ──────────────────────────────────────────────────────────

export async function getCampaignPerformance(
  siteId: string,
  customerId: string
): Promise<AdsCampaignMetrics[]> {
  const query = `
    SELECT
      campaign.id,
      campaign.name,
      campaign.status,
      metrics.impressions,
      metrics.clicks,
      metrics.conversions,
      metrics.cost_micros,
      metrics.ctr,
      metrics.average_cpc
    FROM campaign
    WHERE segments.date DURING LAST_30_DAYS
      AND campaign.status != 'REMOVED'
    ORDER BY metrics.cost_micros DESC
    LIMIT 20
  `

  const results = await gaqlQuery(siteId, customerId, query)

  return results.map((r: any) => ({
    campaignId: r.campaign?.id ?? '',
    campaignName: r.campaign?.name ?? '',
    status: r.campaign?.status ?? '',
    impressions: r.metrics?.impressions ?? 0,
    clicks: r.metrics?.clicks ?? 0,
    conversions: r.metrics?.conversions ?? 0,
    costMicros: r.metrics?.costMicros ?? 0,
    ctr: r.metrics?.ctr ?? 0,
    avgCpc: r.metrics?.averageCpc ?? 0,
  }))
}

export async function getKeywordPerformance(
  siteId: string,
  customerId: string
): Promise<AdsKeywordMetrics[]> {
  const query = `
    SELECT
      ad_group_criterion.keyword.text,
      ad_group_criterion.keyword.match_type,
      campaign.name,
      ad_group.name,
      ad_group_criterion.quality_info.quality_score,
      ad_group_criterion.quality_info.creative_quality_score,
      ad_group_criterion.quality_info.search_predicted_ctr,
      ad_group_criterion.quality_info.post_click_quality_score,
      metrics.impressions,
      metrics.clicks,
      metrics.conversions,
      metrics.cost_micros,
      metrics.average_cpc
    FROM keyword_view
    WHERE segments.date DURING LAST_30_DAYS
      AND ad_group_criterion.status != 'REMOVED'
      AND campaign.status != 'REMOVED'
    ORDER BY metrics.cost_micros DESC
    LIMIT 50
  `

  const results = await gaqlQuery(siteId, customerId, query)

  return results.map((r: any) => ({
    keywordText: r.adGroupCriterion?.keyword?.text ?? '',
    matchType: r.adGroupCriterion?.keyword?.matchType ?? '',
    campaignName: r.campaign?.name ?? '',
    adGroupName: r.adGroup?.name ?? '',
    qualityScore: r.adGroupCriterion?.qualityInfo?.qualityScore ?? null,
    expectedCtr: r.adGroupCriterion?.qualityInfo?.searchPredictedCtr ?? null,
    adRelevance: r.adGroupCriterion?.qualityInfo?.creativeQualityScore ?? null,
    landingPageExperience: r.adGroupCriterion?.qualityInfo?.postClickQualityScore ?? null,
    impressions: r.metrics?.impressions ?? 0,
    clicks: r.metrics?.clicks ?? 0,
    conversions: r.metrics?.conversions ?? 0,
    costMicros: r.metrics?.costMicros ?? 0,
    avgCpc: r.metrics?.averageCpc ?? 0,
  }))
}

export async function getSearchTerms(
  siteId: string,
  customerId: string,
  limit = 50
): Promise<AdsSearchTermMetrics[]> {
  const query = `
    SELECT
      search_term_view.search_term,
      search_term_view.status,
      campaign.name,
      metrics.impressions,
      metrics.clicks,
      metrics.conversions,
      metrics.cost_micros,
      metrics.ctr
    FROM search_term_view
    WHERE segments.date DURING LAST_30_DAYS
      AND metrics.impressions > 10
    ORDER BY metrics.conversions DESC, metrics.clicks DESC
    LIMIT ${limit}
  `

  const results = await gaqlQuery(siteId, customerId, query)

  return results.map((r: any) => ({
    searchTerm: r.searchTermView?.searchTerm ?? '',
    matchType: r.searchTermView?.status ?? '',
    campaignName: r.campaign?.name ?? '',
    impressions: r.metrics?.impressions ?? 0,
    clicks: r.metrics?.clicks ?? 0,
    conversions: r.metrics?.conversions ?? 0,
    costMicros: r.metrics?.costMicros ?? 0,
    ctr: r.metrics?.ctr ?? 0,
  }))
}

export async function getAdCopy(
  siteId: string,
  customerId: string
): Promise<{ campaignName: string; adGroupName: string; headlines: string[]; descriptions: string[]; finalUrl: string; impressions: number; clicks: number; ctr: number }[]> {
  const query = `
    SELECT
      campaign.name,
      ad_group.name,
      ad_group_ad.ad.responsive_search_ad.headlines,
      ad_group_ad.ad.responsive_search_ad.descriptions,
      ad_group_ad.ad.final_urls,
      metrics.impressions,
      metrics.clicks,
      metrics.ctr
    FROM ad_group_ad
    WHERE segments.date DURING LAST_30_DAYS
      AND ad_group_ad.status != 'REMOVED'
      AND campaign.status != 'REMOVED'
      AND ad_group_ad.ad.type = 'RESPONSIVE_SEARCH_AD'
    ORDER BY metrics.impressions DESC
    LIMIT 20
  `

  const results = await gaqlQuery(siteId, customerId, query)

  return results.map((r: any) => ({
    campaignName: r.campaign?.name ?? '',
    adGroupName: r.adGroup?.name ?? '',
    headlines: (r.adGroupAd?.ad?.responsiveSearchAd?.headlines ?? [])
      .map((h: any) => h.text ?? ''),
    descriptions: (r.adGroupAd?.ad?.responsiveSearchAd?.descriptions ?? [])
      .map((d: any) => d.text ?? ''),
    finalUrl: (r.adGroupAd?.ad?.finalUrls ?? [])[0] ?? '',
    impressions: r.metrics?.impressions ?? 0,
    clicks: r.metrics?.clicks ?? 0,
    ctr: r.metrics?.ctr ?? 0,
  }))
}

// Helper: format cost from micros to dollars
export function microsToDollars(micros: number): string {
  return `$${(micros / 1_000_000).toFixed(2)}`
}
