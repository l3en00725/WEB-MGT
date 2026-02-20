import { inngest } from './client'
import { createAdminClient } from '@/lib/supabase/admin'
import { runSeoAudit } from '@/lib/skills/seo-audit'
import { runGoogleDiscover } from '@/lib/skills/google-discover'
import { runConversion } from '@/lib/skills/conversion'
import { runTechnicalSeo } from '@/lib/skills/technical-seo'
import { fileExistsInRepo } from '@/lib/github'

interface RunSkillEvent {
  data: {
    siteId: string
    skillId: string
    skillSlug: string
    triggeredBy: 'cron' | 'manual'
  }
}

export const runSkillFunction = inngest.createFunction(
  {
    id: 'run-skill',
    name: 'Run Skill',
    concurrency: { limit: 3 },
    retries: 1,
  },
  { event: 'skill/run' },
  async ({ event, step }: { event: RunSkillEvent; step: any }) => {
    const { siteId, skillId, skillSlug, triggeredBy } = event.data
    const adminClient = createAdminClient()

    // Check for already-running skill run
    const { data: existingRun } = await adminClient
      .from('skill_runs')
      .select('id')
      .eq('site_id', siteId)
      .eq('skill_id', skillId)
      .eq('status', 'running')
      .single()

    if (existingRun) {
      return { skipped: true, reason: 'Already running' }
    }

    // Get site data
    const { data: site } = await adminClient
      .from('sites')
      .select('*')
      .eq('id', siteId)
      .single()

    if (!site) {
      throw new Error(`Site ${siteId} not found`)
    }

    // Create skill run record
    const { data: skillRun } = await adminClient
      .from('skill_runs')
      .insert({
        site_id: siteId,
        skill_id: skillId,
        status: 'running',
        triggered_by: triggeredBy,
        started_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (!skillRun) throw new Error('Failed to create skill run')

    // Audit log
    await adminClient.from('audit_log').insert({
      site_id: siteId,
      action: 'skill_run_started',
      details: { skill_run_id: skillRun.id, skill_slug: skillSlug, triggered_by: triggeredBy },
    })

    try {
      let results: any[] = []
      let rawGscData: any = null
      let rawGa4Data: any = null
      let rawCrawlData: any = null
      let rawPsiData: any = null

      const commonInput = {
        siteId,
        domain: site.domain,
        githubOwner: site.github_owner,
        githubRepo: site.github_repo,
        githubBranch: site.github_default_branch,
      }

      if (skillSlug === 'seo-audit') {
        if (!site.gsc_property) throw new Error('GSC property not configured')
        const output = await step.run('run-seo-audit', () =>
          runSeoAudit({ ...commonInput, gscProperty: site.gsc_property! })
        )
        results = output.results
        rawGscData = output.rawGscData
      } else if (skillSlug === 'google-discover') {
        if (!site.gsc_property) throw new Error('GSC property not configured')
        const output = await step.run('run-google-discover', () =>
          runGoogleDiscover({ ...commonInput, gscProperty: site.gsc_property! })
        )
        results = output.results
        rawGscData = output.rawGscData
      } else if (skillSlug === 'conversion') {
        if (!site.ga4_property_id) throw new Error('GA4 property not configured')
        const output = await step.run('run-conversion', () =>
          runConversion({ ...commonInput, ga4PropertyId: site.ga4_property_id! })
        )
        results = output.results
        rawGa4Data = output.rawGa4Data
      } else if (skillSlug === 'technical-seo') {
        if (!site.gsc_property) throw new Error('GSC property not configured')
        const output = await step.run('run-technical-seo', () =>
          runTechnicalSeo({ siteId, domain: site.domain, gscProperty: site.gsc_property! })
        )
        results = output.results
        rawCrawlData = output.rawCrawlData
        rawPsiData = output.rawPsiData
      }

      // Validate file paths and store results
      const resultInserts = await Promise.all(
        results.slice(0, 10).map(async (result) => {
          let filePathUnresolved = false

          // Validate file path exists in repo
          if (result.file_path) {
            const exists = await fileExistsInRepo(
              siteId,
              site.github_owner,
              site.github_repo,
              result.file_path,
              site.github_default_branch
            )
            if (!exists) filePathUnresolved = true
          }

          return {
            skill_run_id: skillRun.id,
            site_id: siteId,
            page_path: result.page_path,
            file_path: result.file_path,
            field_name: result.field_name,
            change_type: result.change_type,
            value_before: result.value_before,
            value_after: result.value_after,
            ai_reasoning: result.ai_reasoning,
            priority: result.priority ?? 'medium',
            status: 'pending' as const,
            gsc_metric: result.gsc_metric ?? null,
            ga4_metric: result.ga4_metric ?? null,
            file_path_unresolved: filePathUnresolved,
          }
        })
      )

      if (resultInserts.length > 0) {
        await adminClient.from('skill_results').insert(resultInserts)
      }

      // Update skill run as completed
      await adminClient
        .from('skill_runs')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          raw_gsc_data: rawGscData,
          raw_ga4_data: rawGa4Data,
          raw_crawl_data: rawCrawlData,
          raw_psi_data: rawPsiData,
        })
        .eq('id', skillRun.id)

      // Update site_skills last_run_at
      await adminClient
        .from('site_skills')
        .update({ last_run_at: new Date().toISOString() })
        .eq('site_id', siteId)
        .eq('skill_id', skillId)

      // Audit log
      await adminClient.from('audit_log').insert({
        site_id: siteId,
        action: 'skill_run_completed',
        details: {
          skill_run_id: skillRun.id,
          skill_slug: skillSlug,
          results_count: resultInserts.length,
        },
      })

      return { success: true, resultsCount: resultInserts.length }
    } catch (error: any) {
      const errorMessage = error.message ?? 'Unknown error'

      await adminClient
        .from('skill_runs')
        .update({
          status: 'failed',
          error_message: errorMessage,
          completed_at: new Date().toISOString(),
        })
        .eq('id', skillRun.id)

      await adminClient.from('audit_log').insert({
        site_id: siteId,
        action: 'skill_run_failed',
        details: { skill_run_id: skillRun.id, skill_slug: skillSlug, error: errorMessage },
      })

      throw error
    }
  }
)
