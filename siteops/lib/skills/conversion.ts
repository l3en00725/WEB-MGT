import { callClaude, truncateFileContent, SkillResultProposal } from '@/lib/anthropic'
import { getGA4PageMetrics } from '@/lib/google'
import { getFileContent } from '@/lib/github'

interface ConversionInput {
  siteId: string
  domain: string
  ga4PropertyId: string
  githubOwner: string
  githubRepo: string
  githubBranch: string
}

export async function runConversion(input: ConversionInput): Promise<{
  results: SkillResultProposal[]
  rawGa4Data: any
}> {
  const endDate = new Date().toISOString().split('T')[0]
  const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  const ga4Pages = await getGA4PageMetrics(
    input.siteId,
    input.ga4PropertyId,
    startDate,
    endDate,
    200 // min 200 sessions
  )

  const rawGa4Data = ga4Pages

  // Focus on high-bounce pages
  const highBouncePages = ga4Pages
    .filter((p: any) => p.bounceRate > 0.6 || p.avgEngagementTime < 30)
    .sort((a: any, b: any) => b.bounceRate - a.bounceRate)
    .slice(0, 8)

  if (!highBouncePages.length) {
    return { results: [], rawGa4Data }
  }

  const pageData: any[] = []

  for (const page of highBouncePages) {
    try {
      const pageUrl = `https://${input.domain}${page.page}`
      const candidates = [
        `app${page.page === '/' ? '' : page.page}/page.tsx`,
        `app${page.page}/page.mdx`,
        `src/app${page.page === '/' ? '' : page.page}/page.tsx`,
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

      pageData.push({
        page: page.page,
        sessions: page.sessions,
        bounceRate: (page.bounceRate * 100).toFixed(1),
        avgEngagementTime: page.avgEngagementTime.toFixed(1),
        filePath,
        fileContent,
      })
    } catch (e) {
      console.warn(`Failed to process page ${page.page}:`, e)
    }
  }

  if (!pageData.length) {
    return { results: [], rawGa4Data }
  }

  const systemPrompt = `You are a conversion rate optimization expert.
Output ONLY valid JSON array. No prose, no markdown outside the JSON.
Only propose specific copy changes. Do not propose design changes that can't be captured in code.`

  const userPrompt = `SITE: ${input.domain}
DATE: ${new Date().toISOString().split('T')[0]}

HIGH-BOUNCE PAGES (from GA4, last 30 days):
${pageData.map(p => `
Page: ${p.page}
Sessions: ${p.sessions}, Bounce rate: ${p.bounceRate}%, Avg engagement: ${p.avgEngagementTime}s
File: ${p.filePath ?? 'not found'}
${p.fileContent ? `\nContent:\n${p.fileContent}` : ''}
`).join('\n---\n')}

For each high-bounce page, analyze:
1. CTA text — is it specific and friction-reducing?
2. Value proposition in hero — is the benefit clear in < 5 seconds?
3. Social proof presence — testimonials, logos, numbers?
4. Form friction — how many fields?

Propose specific copy changes only. Reference exact bounce rate in reasoning.

OUTPUT FORMAT (JSON array):
[
  {
    "page_path": "/pricing",
    "file_path": "app/pricing/page.tsx",
    "field_name": "CTA button text",
    "change_type": "content",
    "value_before": "Get Started",
    "value_after": "Start Free 14-Day Trial",
    "ai_reasoning": "Page has 74% bounce rate. Generic CTA lacks specificity. Adding trial duration reduces friction and sets expectations.",
    "priority": "high",
    "ga4_metric": { "bounce_rate": 0.74, "sessions": 1200 }
  }
]`

  const results = await callClaude(systemPrompt, userPrompt)
  return { results, rawGa4Data }
}
