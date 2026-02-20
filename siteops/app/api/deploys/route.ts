import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  createBranch,
  getFileContent,
  commitFileChange,
  createPullRequest,
  generateBranchName,
  deleteBranch,
} from '@/lib/github'
import { getDeploymentForBranch, waitForDeployment } from '@/lib/vercel'
import { z } from 'zod'

const schema = z.object({
  siteId: z.string().uuid(),
})

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { siteId } = parsed.data

  // Get site
  const { data: site } = await supabase
    .from('sites')
    .select('*')
    .eq('id', siteId)
    .eq('owner_id', user.id)
    .single()

  if (!site) return NextResponse.json({ error: 'Site not found' }, { status: 404 })

  // Get all approved results for this site
  const { data: approvedResults } = await supabase
    .from('skill_results')
    .select('*')
    .eq('site_id', siteId)
    .eq('status', 'approved')

  if (!approvedResults?.length) {
    return NextResponse.json({ error: 'No approved changes to deploy' }, { status: 400 })
  }

  // Filter to results with valid file paths
  const deployableResults = approvedResults.filter(r => !r.file_path_unresolved)
  const unresolvedResults = approvedResults.filter(r => r.file_path_unresolved)

  if (!deployableResults.length) {
    return NextResponse.json({
      error: 'All approved changes have unresolved file paths',
      unresolved: unresolvedResults.map(r => r.file_path),
    }, { status: 400 })
  }

  const branchName = generateBranchName()

  // Create deploy record
  const adminClient = createAdminClient()
  const { data: deploy } = await adminClient
    .from('deploys')
    .insert({
      site_id: siteId,
      deployed_by: user.id,
      skill_result_ids: deployableResults.map(r => r.id),
      github_branch: branchName,
      status: 'pending',
    })
    .select()
    .single()

  if (!deploy) return NextResponse.json({ error: 'Failed to create deploy record' }, { status: 500 })

  // Create GitHub branch
  try {
    await createBranch(
      siteId,
      site.github_owner,
      site.github_repo,
      site.github_default_branch,
      branchName
    )
  } catch (e: any) {
    await adminClient
      .from('deploys')
      .update({ status: 'failed' })
      .eq('id', deploy.id)
    return NextResponse.json({ error: `Failed to create branch: ${e.message}` }, { status: 500 })
  }

  // Commit each file change
  // Group by file_path to batch changes to the same file
  const fileGroups = new Map<string, typeof deployableResults>()
  for (const result of deployableResults) {
    if (!fileGroups.has(result.file_path)) {
      fileGroups.set(result.file_path, [])
    }
    fileGroups.get(result.file_path)!.push(result)
  }

  let lastCommitSha: string | null = null

  try {
    for (const [filePath, fileResults] of Array.from(fileGroups.entries())) {
      // Get current file content
      const currentFile = await getFileContent(
        siteId,
        site.github_owner,
        site.github_repo,
        filePath,
        branchName
      )

      if (!currentFile) continue

      // Apply all changes to the file content
      let updatedContent = currentFile.content
      const fieldNames: string[] = []

      for (const result of fileResults) {
        // Simple string replacement for non-code changes
        if (result.value_before && updatedContent.includes(result.value_before)) {
          updatedContent = updatedContent.replace(result.value_before, result.value_after)
          fieldNames.push(result.field_name)
        }
      }

      if (updatedContent === currentFile.content) continue

      const commitMessage = `[SiteOps] Update ${fieldNames.join(', ')} in ${filePath}`

      lastCommitSha = await commitFileChange(
        siteId,
        site.github_owner,
        site.github_repo,
        branchName,
        filePath,
        updatedContent,
        commitMessage,
        currentFile.sha
      )
    }
  } catch (e: any) {
    await adminClient
      .from('deploys')
      .update({ status: 'failed' })
      .eq('id', deploy.id)
    return NextResponse.json({ error: `Failed to commit changes: ${e.message}` }, { status: 500 })
  }

  // Create PR
  let prUrl: string | null = null
  try {
    const changesSummary = deployableResults
      .map(r => `- ${r.field_name} (${r.page_path})`)
      .join('\n')

    prUrl = await createPullRequest(
      siteId,
      site.github_owner,
      site.github_repo,
      branchName,
      site.github_default_branch,
      `[SiteOps] ${deployableResults.length} improvement${deployableResults.length !== 1 ? 's' : ''}`,
      `## SiteOps automated changes\n\n${changesSummary}\n\n_Reviewed and approved via SiteOps_`
    )
  } catch { /* PR creation is nice-to-have */ }

  // Update deploy record with commit SHA
  await adminClient
    .from('deploys')
    .update({
      github_commit_sha: lastCommitSha,
      github_pr_url: prUrl,
      updated_at: new Date().toISOString(),
    })
    .eq('id', deploy.id)

  // Audit log
  await supabase.from('audit_log').insert({
    site_id: siteId,
    user_id: user.id,
    action: 'deploy_created',
    details: {
      deploy_id: deploy.id,
      branch: branchName,
      changes_count: deployableResults.length,
    },
  })

  // Poll for Vercel deployment in background (non-blocking)
  if (site.vercel_project_id) {
    pollVercelDeploy(siteId, site.vercel_project_id, site.vercel_team_id, branchName, deploy.id, adminClient)
  }

  return NextResponse.json({
    id: deploy.id,
    github_branch: branchName,
    github_pr_url: prUrl,
    status: 'pending',
  }, { status: 201 })
}

// Non-blocking background polling
async function pollVercelDeploy(
  siteId: string,
  projectId: string,
  teamId: string | null,
  branch: string,
  deployId: string,
  adminClient: any
) {
  // Wait up to 2 minutes for Vercel to pick up the branch push
  let vercelDeploymentId: string | null = null
  const start = Date.now()

  while (Date.now() - start < 2 * 60 * 1000) {
    await new Promise(r => setTimeout(r, 10000))
    try {
      vercelDeploymentId = await getDeploymentForBranch(siteId, projectId, branch, teamId)
      if (vercelDeploymentId) break
    } catch { /* retry */ }
  }

  if (!vercelDeploymentId) {
    await adminClient
      .from('deploys')
      .update({ status: 'failed', updated_at: new Date().toISOString() })
      .eq('id', deployId)
    return
  }

  // Wait for deployment to be ready
  const result = await waitForDeployment(siteId, vercelDeploymentId, teamId)

  if (result.status === 'READY') {
    await adminClient
      .from('deploys')
      .update({
        vercel_deployment_id: vercelDeploymentId,
        vercel_preview_url: result.url,
        status: 'preview_ready',
        updated_at: new Date().toISOString(),
      })
      .eq('id', deployId)
  } else {
    await adminClient
      .from('deploys')
      .update({
        vercel_deployment_id: vercelDeploymentId,
        status: 'failed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', deployId)
  }
}
