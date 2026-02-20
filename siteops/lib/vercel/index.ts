import { createAdminClient } from '@/lib/supabase/admin'

const VERCEL_API = 'https://api.vercel.com'

async function getVercelToken(siteId: string): Promise<string> {
  const adminClient = createAdminClient()
  const { data: token } = await adminClient
    .from('site_tokens')
    .select('access_token')
    .eq('site_id', siteId)
    .eq('token_type', 'vercel')
    .single()

  if (!token) throw new Error('Vercel token not configured for this site')
  return token.access_token
}

function teamQuery(teamId?: string | null): string {
  return teamId ? `?teamId=${teamId}` : ''
}

export async function getDeployments(
  siteId: string,
  projectId: string,
  teamId?: string | null
) {
  const token = await getVercelToken(siteId)
  const query = teamId ? `?projectId=${projectId}&teamId=${teamId}` : `?projectId=${projectId}`
  const res = await fetch(`${VERCEL_API}/v6/deployments${query}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`Vercel API error: ${res.statusText}`)
  return res.json()
}

export async function getDeployment(
  siteId: string,
  deploymentId: string,
  teamId?: string | null
) {
  const token = await getVercelToken(siteId)
  const res = await fetch(`${VERCEL_API}/v13/deployments/${deploymentId}${teamQuery(teamId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`Vercel API error: ${res.statusText}`)
  return res.json()
}

export async function promoteToProduction(
  siteId: string,
  deploymentId: string,
  teamId?: string | null
) {
  const token = await getVercelToken(siteId)
  const res = await fetch(
    `${VERCEL_API}/v10/deployments/${deploymentId}/promote${teamQuery(teamId)}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    }
  )
  if (!res.ok) throw new Error(`Vercel promote failed: ${res.statusText}`)
  return res.json()
}

export async function getProjectDomains(
  siteId: string,
  projectId: string,
  teamId?: string | null
) {
  const token = await getVercelToken(siteId)
  const query = teamId ? `?teamId=${teamId}` : ''
  const res = await fetch(`${VERCEL_API}/v9/projects/${projectId}/domains${query}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`Vercel API error: ${res.statusText}`)
  return res.json()
}

// Poll deployment until READY or FAILED, with 10-minute timeout
export async function waitForDeployment(
  siteId: string,
  deploymentId: string,
  teamId?: string | null
): Promise<{ status: string; url?: string }> {
  const startTime = Date.now()
  const timeout = 10 * 60 * 1000 // 10 minutes

  while (Date.now() - startTime < timeout) {
    const deployment = await getDeployment(siteId, deploymentId, teamId)

    if (deployment.readyState === 'READY') {
      return {
        status: 'READY',
        url: `https://${deployment.url}`,
      }
    }

    if (deployment.readyState === 'ERROR' || deployment.readyState === 'CANCELED') {
      return { status: deployment.readyState }
    }

    await new Promise(resolve => setTimeout(resolve, 5000))
  }

  return { status: 'TIMEOUT' }
}

// Find most recent deployment for a branch
export async function getDeploymentForBranch(
  siteId: string,
  projectId: string,
  branch: string,
  teamId?: string | null
): Promise<string | null> {
  const token = await getVercelToken(siteId)
  const query = new URLSearchParams({ projectId, target: 'preview', limit: '10' })
  if (teamId) query.set('teamId', teamId)

  const res = await fetch(`${VERCEL_API}/v6/deployments?${query}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) return null

  const { deployments } = await res.json()
  const match = deployments?.find((d: any) => d.meta?.githubCommitRef === branch)
  return match?.uid ?? null
}
