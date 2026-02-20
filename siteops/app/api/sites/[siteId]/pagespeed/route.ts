import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const PSI_BASE = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed'

interface PSIResult {
  strategy: 'mobile' | 'desktop'
  performance_score: number
  seo_score: number
  accessibility_score: number
  lcp_ms: number
  cls_score: number
  inp_ms: number
  fcp_ms: number
  ttfb_ms: number
  opportunities: { id: string; title: string; description: string; savings_ms?: number }[]
  audits_failed: string[]
}

async function fetchPSI(url: string, strategy: 'mobile' | 'desktop'): Promise<PSIResult | null> {
  const apiKey = process.env.PAGESPEED_API_KEY
  if (!apiKey) return null

  const params = new URLSearchParams({
    url,
    strategy,
    category: 'performance,seo,accessibility,best-practices',
    key: apiKey,
  })

  const res = await fetch(`${PSI_BASE}?${params}`)
  if (!res.ok) return null

  const data = await res.json()
  const cats = data.lighthouseResult?.categories ?? {}
  const audits = data.lighthouseResult?.audits ?? {}

  const getMs = (auditId: string) => {
    const val = audits[auditId]?.numericValue
    return val ? Math.round(val) : 0
  }

  const opportunities = Object.values(audits)
    .filter((a: any) => a.details?.type === 'opportunity' && a.score !== null && a.score < 1)
    .map((a: any) => ({
      id: a.id,
      title: a.title,
      description: a.description,
      savings_ms: a.details?.overallSavingsMs ? Math.round(a.details.overallSavingsMs) : undefined,
    }))
    .sort((a: any, b: any) => (b.savings_ms ?? 0) - (a.savings_ms ?? 0))
    .slice(0, 10)

  const auditsFailed = Object.entries(audits)
    .filter(([_, a]: [string, any]) => a.score !== null && a.score < 0.9)
    .map(([id]) => id)

  return {
    strategy,
    performance_score: Math.round((cats.performance?.score ?? 0) * 100),
    seo_score: Math.round((cats.seo?.score ?? 0) * 100),
    accessibility_score: Math.round((cats.accessibility?.score ?? 0) * 100),
    lcp_ms: getMs('largest-contentful-paint'),
    cls_score: audits['cumulative-layout-shift']?.numericValue ?? 0,
    inp_ms: getMs('interaction-to-next-paint') || getMs('total-blocking-time'),
    fcp_ms: getMs('first-contentful-paint'),
    ttfb_ms: getMs('server-response-time'),
    opportunities,
    audits_failed: auditsFailed,
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: { siteId: string } }
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: site } = await supabase
    .from('sites')
    .select('domain')
    .eq('id', params.siteId)
    .eq('owner_id', user.id)
    .single()

  if (!site) return NextResponse.json({ error: 'Site not found' }, { status: 404 })

  const { searchParams } = new URL(req.url)
  const pageUrl = searchParams.get('url') ?? `https://${site.domain}`

  // Check for recent snapshots (less than 5 minutes old)
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
  const { data: existing } = await supabase
    .from('psi_snapshots')
    .select('*')
    .eq('site_id', params.siteId)
    .eq('page_url', pageUrl)
    .gte('created_at', fiveMinutesAgo)
    .order('created_at', { ascending: false })
    .limit(2)

  if (existing?.length === 2) {
    const mobile = existing.find(s => s.strategy === 'mobile')
    const desktop = existing.find(s => s.strategy === 'desktop')
    if (mobile && desktop) {
      return NextResponse.json({ mobile, desktop })
    }
  }

  // Fetch fresh PSI data — add 500ms delay between requests
  const mobileResult = await fetchPSI(pageUrl, 'mobile')
  await new Promise(resolve => setTimeout(resolve, 500))
  const desktopResult = await fetchPSI(pageUrl, 'desktop')

  if (!mobileResult || !desktopResult) {
    return NextResponse.json({ error: 'Failed to fetch PageSpeed data' }, { status: 500 })
  }

  // Store snapshots
  const insertData = [
    {
      site_id: params.siteId,
      page_url: pageUrl,
      strategy: 'mobile' as const,
      performance_score: mobileResult.performance_score,
      seo_score: mobileResult.seo_score,
      accessibility_score: mobileResult.accessibility_score,
      lcp_ms: mobileResult.lcp_ms,
      cls_score: mobileResult.cls_score,
      inp_ms: mobileResult.inp_ms,
      fcp_ms: mobileResult.fcp_ms,
      ttfb_ms: mobileResult.ttfb_ms,
      opportunities: mobileResult.opportunities,
    },
    {
      site_id: params.siteId,
      page_url: pageUrl,
      strategy: 'desktop' as const,
      performance_score: desktopResult.performance_score,
      seo_score: desktopResult.seo_score,
      accessibility_score: desktopResult.accessibility_score,
      lcp_ms: desktopResult.lcp_ms,
      cls_score: desktopResult.cls_score,
      inp_ms: desktopResult.inp_ms,
      fcp_ms: desktopResult.fcp_ms,
      ttfb_ms: desktopResult.ttfb_ms,
      opportunities: desktopResult.opportunities,
    },
  ]

  const { data: inserted } = await supabase
    .from('psi_snapshots')
    .insert(insertData)
    .select()

  return NextResponse.json({
    mobile: inserted?.find(s => s.strategy === 'mobile') ?? { ...mobileResult },
    desktop: inserted?.find(s => s.strategy === 'desktop') ?? { ...desktopResult },
  })
}
