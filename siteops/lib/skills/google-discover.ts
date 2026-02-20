import { callClaude, truncateFileContent, SkillResultProposal } from '@/lib/anthropic'
import { getDiscoverPerformance, getGSCSearchPerformance } from '@/lib/google'
import { getFileContent } from '@/lib/github'

interface GoogleDiscoverInput {
  siteId: string
  domain: string
  gscProperty: string
  githubOwner: string
  githubRepo: string
  githubBranch: string
}

export async function runGoogleDiscover(input: GoogleDiscoverInput): Promise<{
  results: SkillResultProposal[]
  rawGscData: any
}> {
  const now = new Date()
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000)

  const [discover30, discover60, webPages] = await Promise.all([
    getDiscoverPerformance(
      input.siteId,
      input.gscProperty,
      thirtyDaysAgo.toISOString().split('T')[0],
      now.toISOString().split('T')[0]
    ),
    getDiscoverPerformance(
      input.siteId,
      input.gscProperty,
      sixtyDaysAgo.toISOString().split('T')[0],
      thirtyDaysAgo.toISOString().split('T')[0]
    ),
    getGSCSearchPerformance(
      input.siteId,
      input.gscProperty,
      thirtyDaysAgo.toISOString().split('T')[0],
      now.toISOString().split('T')[0],
      ['page'],
      'web',
      20
    ),
  ])

  const rawGscData = { discover30, discover60, webPages }

  // Merge and identify declining pages
  const discoverByPage: Record<string, { current: any; previous?: any }> = {}
  discover30.forEach(p => { discoverByPage[p.page] = { current: p } })
  discover60.forEach(p => {
    if (discoverByPage[p.page]) {
      discoverByPage[p.page].previous = p
    }
  })

  // Top pages to audit: Discover pages + top web pages
  const pagesToAudit = new Set<string>()
  discover30.slice(0, 5).forEach(p => pagesToAudit.add(p.page))
  webPages.slice(0, 5).forEach(p => pagesToAudit.add(p.page))

  const pageData: any[] = []

  for (const pageUrl of Array.from(pagesToAudit).slice(0, 8)) {
    try {
      const pagePath = new URL(pageUrl).pathname
      const candidates = [
        `app${pagePath}/page.tsx`,
        `app${pagePath}/page.mdx`,
        `src/app${pagePath}/page.tsx`,
      ]

      let fileContent: string | null = null
      let filePath: string | null = null

      for (const candidate of candidates) {
        const result = await getFileContent(
          input.siteId,
          input.githubOwner,
          input.githubRepo,
          candidate,
          input.githubBranch
        )
        if (result) {
          fileContent = truncateFileContent(result.content)
          filePath = candidate
          break
        }
      }

      const discoverData = discoverByPage[pageUrl]
      const impressionChange = discoverData?.previous
        ? ((discoverData.current.impressions - discoverData.previous.impressions) / Math.max(discoverData.previous.impressions, 1)) * 100
        : 0

      pageData.push({
        url: pageUrl,
        pagePath,
        filePath,
        fileContent,
        discoverCurrent: discoverData?.current,
        discoverPrevious: discoverData?.previous,
        impressionChange: impressionChange.toFixed(1),
      })
    } catch (e) {
      console.warn(`Failed to process page ${pageUrl}:`, e)
    }
  }

  if (!pageData.length) {
    return { results: [], rawGscData }
  }

  const systemPrompt = `You are a Google Discover optimization expert.
Output ONLY valid JSON array. No prose, no markdown outside the JSON.`

  const userPrompt = `SITE: ${input.domain}
DATE: ${now.toISOString().split('T')[0]}

DISCOVER ELIGIBILITY REQUIREMENTS:
- og:image must be present and reference an image ≥ 1200px wide
- Article must have datePublished and dateModified schema
- Author must have Person schema with name and credentials
- Content should be ≥ 800 words for substantial Discover distribution
- Content freshness: pages not updated in 90+ days lose Discover eligibility

PAGES TO AUDIT:
${pageData.map(p => `
URL: ${p.url}
Discover impressions (30d): ${p.discoverCurrent?.impressions ?? 0}
Impression change vs prev 30d: ${p.impressionChange}%
File: ${p.filePath ?? 'not found'}
${p.fileContent ? `\nContent:\n${p.fileContent}` : ''}
`).join('\n---\n')}

Identify and propose fixes for:
1. Missing or small og:image (< 1200px)
2. Missing Article/Person schema
3. Missing datePublished/dateModified
4. Content under 800 words
5. Pages with declining Discover impressions (> 25% drop)

OUTPUT FORMAT (JSON array):
[
  {
    "page_path": "/blog/example",
    "file_path": "app/blog/example/page.tsx",
    "field_name": "og:image",
    "change_type": "metadata",
    "value_before": "",
    "value_after": "https://example.com/images/og-image-1200x630.jpg",
    "ai_reasoning": "Page has no og:image. Discover requires images ≥ 1200px wide.",
    "priority": "high",
    "gsc_metric": { "discover_impressions": 0, "impression_change_pct": 0 }
  }
]`

  const results = await callClaude(systemPrompt, userPrompt)
  return { results, rawGscData }
}
