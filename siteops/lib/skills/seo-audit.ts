import { callClaude, truncateFileContent, SkillResultProposal } from '@/lib/anthropic'
import { getGSCSearchPerformance, getGSCQueryPerformance } from '@/lib/google'
import { getFileContent } from '@/lib/github'

interface SeoAuditInput {
  siteId: string
  domain: string
  gscProperty: string
  githubOwner: string
  githubRepo: string
  githubBranch: string
}

export async function runSeoAudit(input: SeoAuditInput): Promise<{
  results: SkillResultProposal[]
  rawGscData: any
}> {
  const endDate = new Date().toISOString().split('T')[0]
  const startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  // Fetch GSC data — top 20 pages by impressions
  const gscPages = await getGSCSearchPerformance(
    input.siteId,
    input.gscProperty,
    startDate,
    endDate,
    ['page'],
    'web',
    20
  )

  const rawGscData = gscPages

  if (!gscPages.length) {
    return { results: [], rawGscData }
  }

  // Fetch file content for top 5 pages
  const topPages = gscPages.slice(0, 5)
  const pageData: any[] = []

  for (const page of topPages) {
    try {
      const pagePath = new URL(page.page).pathname
      // Try common file paths for Next.js app router
      const candidates = [
        `app${pagePath}/page.tsx`,
        `app${pagePath}/page.mdx`,
        `src/app${pagePath}/page.tsx`,
        `pages${pagePath === '/' ? '/index' : pagePath}.tsx`,
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

      // Fetch query data for this page
      const queries = await getGSCQueryPerformance(
        input.siteId,
        input.gscProperty,
        page.page,
        startDate,
        endDate
      )

      // Optionally enrich with Keywords Everywhere
      let kwData: any[] = []
      if (process.env.KEYWORDS_EVERYWHERE_API_KEY && queries.length > 0) {
        try {
          const kwRes = await fetch('https://api.keywordseverywhere.com/v1/get_keyword_data', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${process.env.KEYWORDS_EVERYWHERE_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ keywords: queries.slice(0, 5).map(q => q.query) }),
          })
          if (kwRes.ok) {
            const kwJson = await kwRes.json()
            kwData = kwJson.data ?? []
          }
        } catch { /* KE is optional */ }
      }

      pageData.push({
        url: page.page,
        pagePath,
        filePath,
        fileContent,
        metrics: page,
        topQueries: queries.slice(0, 5),
        kwData,
      })
    } catch (e) {
      console.warn(`Failed to process page ${page.page}:`, e)
    }
  }

  if (!pageData.length) {
    return { results: [], rawGscData }
  }

  const systemPrompt = `You are an expert SEO strategist analyzing a website's search performance.
Output ONLY valid JSON array. No prose, no markdown, no explanation outside the JSON.
Maximum 10 proposed changes per run. Focus on highest-impact opportunities.`

  const userPrompt = `SITE: ${input.domain}
ANALYSIS DATE: ${new Date().toISOString().split('T')[0]}

PAGE DATA:
${pageData.map(p => `
URL: ${p.url}
GSC: ${p.metrics.impressions} impressions, ${p.metrics.clicks} clicks, ${(p.metrics.ctr * 100).toFixed(1)}% CTR, pos ${p.metrics.position.toFixed(1)}
File: ${p.filePath ?? 'not found in repo'}
Top queries: ${p.topQueries.map((q: any) => `"${q.query}" (vol: ${q.impressions})`).join(', ')}
${p.fileContent ? `\nFile content:\n${p.fileContent}` : ''}
`).join('\n---\n')}

OUTPUT FORMAT (JSON array):
[
  {
    "page_path": "/blog/example",
    "file_path": "app/blog/example/page.tsx",
    "field_name": "Meta Description",
    "change_type": "metadata",
    "value_before": "existing value",
    "value_after": "proposed new value",
    "ai_reasoning": "2-3 sentences citing specific metrics",
    "priority": "high|medium|low",
    "gsc_metric": { "impressions": 0, "ctr": 0, "avg_position": 0 }
  }
]

Focus on: title tags under 60 chars, meta descriptions under 160 chars, missing H1s, keyword-poor headings, missing OG tags, duplicate metas. Only propose changes where you have the file content. Prioritize by potential impact.`

  const results = await callClaude(systemPrompt, userPrompt)
  return { results, rawGscData }
}
