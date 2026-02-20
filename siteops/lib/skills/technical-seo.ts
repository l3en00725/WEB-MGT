import * as cheerio from 'cheerio'
import { callClaude, truncateFileContent, SkillResultProposal } from '@/lib/anthropic'
import { getGSCSearchPerformance } from '@/lib/google'
import { createAdminClient } from '@/lib/supabase/admin'

const USER_AGENT = 'SiteOps-Bot/1.0 (+https://siteops.app/bot)'
const PAGE_FETCH_TIMEOUT = 10000
const PSI_DELAY_MS = 500

interface TechnicalSeoInput {
  siteId: string
  domain: string
  gscProperty: string
}

interface CrawledPage {
  url: string
  title: string | null
  metaDescription: string | null
  canonical: string | null
  robotsMeta: string | null
  h1: string | null
  ogImage: string | null
  ogImageWidth: string | null
  schemaBlocks: string[]
  internalLinks: string[]
  error?: string
}

export async function crawlPage(url: string): Promise<CrawledPage | null> {
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(PAGE_FETCH_TIMEOUT),
    })
    if (!response.ok) return null

    const html = await response.text()
    const $ = cheerio.load(html)

    return {
      url,
      title: $('title').text() || null,
      metaDescription: $('meta[name="description"]').attr('content') || null,
      canonical: $('link[rel="canonical"]').attr('href') || null,
      robotsMeta: $('meta[name="robots"]').attr('content') || null,
      h1: $('h1').first().text() || null,
      ogImage: $('meta[property="og:image"]').attr('content') || null,
      ogImageWidth: $('meta[property="og:image:width"]').attr('content') || null,
      schemaBlocks: $('script[type="application/ld+json"]').map((_, el) => $(el).html() ?? '').get(),
      internalLinks: $('a[href^="/"]').map((_, el) => $(el).attr('href') ?? '').get().filter(Boolean),
    }
  } catch (e: any) {
    return { url, error: e.message, title: null, metaDescription: null, canonical: null, robotsMeta: null, h1: null, ogImage: null, ogImageWidth: null, schemaBlocks: [], internalLinks: [] }
  }
}

async function fetchPSIForUrl(url: string, strategy: 'mobile' | 'desktop'): Promise<any | null> {
  const apiKey = process.env.PAGESPEED_API_KEY
  if (!apiKey) return null

  const params = new URLSearchParams({
    url,
    strategy,
    category: 'performance,seo,accessibility,best-practices',
    key: apiKey,
  })

  try {
    const res = await fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${params}`)
    if (!res.ok) return null

    const data = await res.json()
    const cats = data.lighthouseResult?.categories ?? {}
    const audits = data.lighthouseResult?.audits ?? {}

    const opportunities = Object.values(audits)
      .filter((a: any) => a.details?.type === 'opportunity' && a.score !== null && a.score < 1)
      .map((a: any) => ({
        id: a.id,
        title: a.title,
        description: a.description,
        savings_ms: a.details?.overallSavingsMs ? Math.round(a.details.overallSavingsMs) : undefined,
      }))

    return {
      url,
      strategy,
      performance_score: Math.round((cats.performance?.score ?? 0) * 100),
      seo_score: Math.round((cats.seo?.score ?? 0) * 100),
      lcp_ms: Math.round(audits['largest-contentful-paint']?.numericValue ?? 0),
      cls_score: audits['cumulative-layout-shift']?.numericValue ?? 0,
      inp_ms: Math.round(audits['interaction-to-next-paint']?.numericValue ?? audits['total-blocking-time']?.numericValue ?? 0),
      opportunities: opportunities.slice(0, 5),
    }
  } catch {
    return null
  }
}

export async function runTechnicalSeo(input: TechnicalSeoInput): Promise<{
  results: SkillResultProposal[]
  rawCrawlData: any
  rawPsiData: any
}> {
  const endDate = new Date().toISOString().split('T')[0]
  const startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  // Get top pages from GSC
  const gscPages = await getGSCSearchPerformance(
    input.siteId,
    input.gscProperty,
    startDate,
    endDate,
    ['page'],
    'web',
    20
  )

  // Fetch sitemap
  let sitemapUrls: string[] = []
  try {
    const sitemapRes = await fetch(`https://${input.domain}/sitemap.xml`, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(10000),
    })
    if (sitemapRes.ok) {
      const sitemapXml = await sitemapRes.text()
      const matches = sitemapXml.match(/<loc>(.*?)<\/loc>/g) ?? []
      sitemapUrls = matches.map(m => m.replace(/<\/?loc>/g, '')).slice(0, 20)
    }
  } catch { /* sitemap optional */ }

  // Fetch robots.txt
  let robotsTxt = ''
  try {
    const robotsRes = await fetch(`https://${input.domain}/robots.txt`, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(10000),
    })
    if (robotsRes.ok) {
      robotsTxt = await robotsRes.text()
    }
  } catch { /* robots.txt optional */ }

  // Build list of URLs to crawl (max 20)
  const urlsToCrawl = new Set<string>()
  urlsToCrawl.add(`https://${input.domain}`)
  gscPages.slice(0, 10).forEach(p => urlsToCrawl.add(p.page))
  sitemapUrls.slice(0, 10).forEach(u => urlsToCrawl.add(u))

  const crawlUrls = Array.from(urlsToCrawl).slice(0, 20)

  // Crawl pages
  const crawlResults: CrawledPage[] = []
  for (const url of crawlUrls) {
    const result = await crawlPage(url)
    if (result) crawlResults.push(result)
    await new Promise(resolve => setTimeout(resolve, 200)) // be polite
  }

  // Run PSI on top 5 GSC pages
  const psiResults: any[] = []
  const topPsiUrls = gscPages.slice(0, 5).map(p => p.page)

  for (const url of topPsiUrls) {
    const [mobile, desktop] = await Promise.all([
      fetchPSIForUrl(url, 'mobile'),
      (async () => {
        await new Promise(r => setTimeout(r, PSI_DELAY_MS))
        return fetchPSIForUrl(url, 'desktop')
      })(),
    ])
    if (mobile) psiResults.push(mobile)
    if (desktop) psiResults.push(desktop)

    // Store PSI snapshots
    if (mobile || desktop) {
      const adminClient = createAdminClient()
      const snapshots = [mobile, desktop].filter(Boolean).map((psi: any) => ({
        site_id: input.siteId,
        page_url: url,
        strategy: psi.strategy,
        performance_score: psi.performance_score,
        seo_score: psi.seo_score,
        lcp_ms: psi.lcp_ms,
        cls_score: psi.cls_score,
        inp_ms: psi.inp_ms,
        opportunities: psi.opportunities,
      }))
      await adminClient.from('psi_snapshots').insert(snapshots)
    }

    await new Promise(resolve => setTimeout(resolve, PSI_DELAY_MS))
  }

  const rawCrawlData = crawlResults
  const rawPsiData = psiResults

  if (!crawlResults.length) {
    return { results: [], rawCrawlData, rawPsiData }
  }

  const systemPrompt = `You are a technical SEO expert.
Output ONLY valid JSON array. No prose, no markdown outside the JSON.
For schema proposals, output the complete JSON-LD block as value_after.`

  const userPrompt = `SITE: ${input.domain}
DATE: ${new Date().toISOString().split('T')[0]}

ROBOTS.TXT:
${robotsTxt || '(not found)'}

CRAWL DATA:
${crawlResults.slice(0, 10).map(p => `
URL: ${p.url}
${p.error ? `ERROR: ${p.error}` : `
Title: ${p.title ?? 'missing'}
Meta desc: ${p.metaDescription ? `"${p.metaDescription.slice(0, 100)}"` : 'missing'}
Canonical: ${p.canonical ?? 'missing'}
Robots meta: ${p.robotsMeta ?? 'none'}
H1: ${p.h1 ? `"${p.h1}"` : 'missing'}
OG image: ${p.ogImage ?? 'missing'} ${p.ogImageWidth ? `(${p.ogImageWidth}px wide)` : ''}
Schema blocks: ${p.schemaBlocks.length} found
`}`).join('\n---\n')}

PAGESPEED INSIGHTS (top pages):
${psiResults.filter(p => p.strategy === 'mobile').map(p => `
URL: ${p.url}
Performance: ${p.performance_score}/100, SEO: ${p.seo_score}/100
LCP: ${(p.lcp_ms / 1000).toFixed(2)}s, CLS: ${p.cls_score?.toFixed(3)}, INP: ${p.inp_ms}ms
Top opportunities: ${p.opportunities?.slice(0, 3).map((o: any) => `${o.title} (save ${o.savings_ms ? (o.savings_ms / 1000).toFixed(1) + 's' : 'N/A'})`).join(', ')}
`).join('\n')}

GSC COVERAGE ISSUES (top pages with issues):
${gscPages.filter(p => p.impressions > 0).slice(0, 5).map(p => `${p.page}: ${p.impressions} impressions, position ${p.position.toFixed(1)}`).join('\n')}

Technical audit priorities:
1. Pages with PSI performance score < 50 on mobile
2. Missing canonical tags
3. Missing H1 tags
4. Missing schema markup (article pages need Article schema)
5. og:image missing or too small (< 1200px)
6. robots.txt blocking important paths

OUTPUT FORMAT (JSON array):
[
  {
    "page_path": "/blog/example",
    "file_path": "app/blog/example/page.tsx",
    "field_name": "Canonical tag",
    "change_type": "code",
    "value_before": "(missing)",
    "value_after": "<link rel=\\"canonical\\" href=\\"https://${input.domain}/blog/example\\" />",
    "ai_reasoning": "Page lacks canonical tag. Without canonical, search engines may index duplicate content versions.",
    "priority": "high"
  }
]`

  const results = await callClaude(systemPrompt, userPrompt)
  return { results, rawCrawlData, rawPsiData }
}
