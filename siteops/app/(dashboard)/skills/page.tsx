import { createClient } from '@/lib/supabase/server'
import SkillsClient from '@/components/dashboard/SkillsClient'

export default async function SkillsPage() {
  const supabase = createClient()

  const [{ data: skills }, { data: sites }, { data: siteSkills }] = await Promise.all([
    supabase.from('skills').select('*').order('name'),
    supabase.from('sites').select('id, name, domain').order('name'),
    supabase.from('site_skills').select('*, skills(name, slug)'),
  ])

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-text-primary">Skills</h1>
        <p className="text-sm text-text-secondary mt-1">Configure which skills run on each site</p>
      </div>

      <SkillsClient
        skills={skills ?? []}
        sites={sites ?? []}
        siteSkills={siteSkills ?? []}
      />
    </div>
  )
}
