import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

const SkillResultSchema = z.object({
  page_path: z.string(),
  file_path: z.string(),
  field_name: z.string(),
  change_type: z.enum(['content', 'metadata', 'schema', 'image', 'code']),
  value_before: z.string(),
  value_after: z.string(),
  ai_reasoning: z.string(),
  priority: z.enum(['high', 'medium', 'low']),
  gsc_metric: z.record(z.string(), z.unknown()).optional().nullable(),
  ga4_metric: z.record(z.string(), z.unknown()).optional().nullable(),
})

export type SkillResultProposal = z.infer<typeof SkillResultSchema>

export async function callClaude(
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number = 4096
): Promise<SkillResultProposal[]> {
  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  })

  const content = message.content[0]
  if (content.type !== 'text') {
    throw new Error('Unexpected Claude response type')
  }

  // Extract JSON from response
  const text = content.text.trim()
  let jsonText = text

  // Handle code fences if present
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (jsonMatch) {
    jsonText = jsonMatch[1].trim()
  }

  const parsed = JSON.parse(jsonText)
  const results = Array.isArray(parsed) ? parsed : [parsed]

  return results
    .map(r => {
      const validated = SkillResultSchema.safeParse(r)
      if (!validated.success) {
        console.warn('Invalid skill result from Claude:', r, validated.error)
        return null
      }
      return validated.data
    })
    .filter((r): r is SkillResultProposal => r !== null)
}

// Truncate content to stay within token limits
// Prioritize <head> section and first 500 lines
export function truncateFileContent(content: string, maxChars: number = 32000): string {
  if (content.length <= maxChars) return content

  const lines = content.split('\n')
  const headEnd = lines.findIndex(l => l.toLowerCase().includes('</head>'))

  if (headEnd > 0) {
    const head = lines.slice(0, headEnd + 1).join('\n')
    const body = lines.slice(headEnd + 1, 500).join('\n')
    const combined = head + '\n' + body
    if (combined.length <= maxChars) return combined
    return combined.slice(0, maxChars) + '\n... [truncated]'
  }

  return content.slice(0, maxChars) + '\n... [truncated]'
}
