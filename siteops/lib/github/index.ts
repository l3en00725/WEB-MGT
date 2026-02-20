import { Octokit } from '@octokit/rest'
import { createAdminClient } from '@/lib/supabase/admin'

async function getOctokit(siteId: string): Promise<Octokit> {
  const adminClient = createAdminClient()
  const { data: token } = await adminClient
    .from('site_tokens')
    .select('access_token')
    .eq('site_id', siteId)
    .eq('token_type', 'github')
    .single()

  if (!token) throw new Error('GitHub token not configured for this site')
  return new Octokit({ auth: token.access_token })
}

export async function getFileContent(
  siteId: string,
  owner: string,
  repo: string,
  path: string,
  ref?: string
): Promise<{ content: string; sha: string } | null> {
  try {
    const octokit = await getOctokit(siteId)
    const response = await octokit.repos.getContent({
      owner,
      repo,
      path,
      ...(ref ? { ref } : {}),
    })

    if ('content' in response.data && response.data.type === 'file') {
      return {
        content: Buffer.from(response.data.content, 'base64').toString('utf-8'),
        sha: response.data.sha,
      }
    }
    return null
  } catch (e: any) {
    if (e.status === 404) return null
    throw e
  }
}

export async function createBranch(
  siteId: string,
  owner: string,
  repo: string,
  baseBranch: string,
  newBranchName: string
): Promise<void> {
  const octokit = await getOctokit(siteId)
  const { data: baseRef } = await octokit.git.getRef({
    owner,
    repo,
    ref: `heads/${baseBranch}`,
  })

  await octokit.git.createRef({
    owner,
    repo,
    ref: `refs/heads/${newBranchName}`,
    sha: baseRef.object.sha,
  })
}

export async function commitFileChange(
  siteId: string,
  owner: string,
  repo: string,
  branch: string,
  path: string,
  content: string,
  message: string,
  fileSHA?: string
): Promise<string> {
  const octokit = await getOctokit(siteId)

  const { data } = await octokit.repos.createOrUpdateFileContents({
    owner,
    repo,
    path,
    message,
    content: Buffer.from(content).toString('base64'),
    branch,
    sha: fileSHA,
  })

  return data.commit.sha ?? ''
}

export async function createPullRequest(
  siteId: string,
  owner: string,
  repo: string,
  head: string,
  base: string,
  title: string,
  body: string
): Promise<string> {
  const octokit = await getOctokit(siteId)
  const { data } = await octokit.pulls.create({
    owner,
    repo,
    title,
    body,
    head,
    base,
  })
  return data.html_url
}

export async function deleteBranch(
  siteId: string,
  owner: string,
  repo: string,
  branch: string
): Promise<void> {
  const octokit = await getOctokit(siteId)
  try {
    await octokit.git.deleteRef({
      owner,
      repo,
      ref: `heads/${branch}`,
    })
  } catch (e: any) {
    if (e.status !== 404) throw e
  }
}

export async function listRepoFiles(
  siteId: string,
  owner: string,
  repo: string,
  ref?: string,
  path: string = ''
): Promise<string[]> {
  const octokit = await getOctokit(siteId)

  try {
    const { data: tree } = await octokit.git.getTree({
      owner,
      repo,
      tree_sha: ref ?? 'HEAD',
      recursive: '1',
    })

    return (tree.tree ?? [])
      .filter(item => item.type === 'blob')
      .map(item => item.path ?? '')
      .filter(Boolean)
  } catch {
    return []
  }
}

export async function fileExistsInRepo(
  siteId: string,
  owner: string,
  repo: string,
  path: string,
  ref?: string
): Promise<boolean> {
  const content = await getFileContent(siteId, owner, repo, path, ref)
  return content !== null
}

export function generateBranchName(): string {
  const date = new Date().toISOString().split('T')[0]
  const shortId = Math.random().toString(36).slice(2, 7)
  return `siteops/deploy-${date}-${shortId}`
}
