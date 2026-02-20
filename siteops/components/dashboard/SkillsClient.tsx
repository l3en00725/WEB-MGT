'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

interface SkillsClientProps {
  skills: any[]
  sites: any[]
  siteSkills: any[]
}

export default function SkillsClient({ skills, sites, siteSkills }: SkillsClientProps) {
  const [localSiteSkills, setLocalSiteSkills] = useState(siteSkills)
  const [running, setRunning] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const supabase = createClient()

  function isActive(siteId: string, skillId: string) {
    return localSiteSkills.some(ss => ss.site_id === siteId && ss.skill_id === skillId && ss.is_active)
  }

  async function toggleSkill(siteId: string, skillId: string) {
    const existing = localSiteSkills.find(ss => ss.site_id === siteId && ss.skill_id === skillId)
    const newValue = !isActive(siteId, skillId)

    if (existing) {
      await supabase
        .from('site_skills')
        .update({ is_active: newValue })
        .eq('id', existing.id)

      setLocalSiteSkills(prev =>
        prev.map(ss => ss.id === existing.id ? { ...ss, is_active: newValue } : ss)
      )
    } else {
      const { data } = await supabase
        .from('site_skills')
        .insert({ site_id: siteId, skill_id: skillId, is_active: true })
        .select()
        .single()

      if (data) {
        setLocalSiteSkills(prev => [...prev, data])
      }
    }
  }

  async function runSkill(siteId: string, skillId: string, skillName: string) {
    setRunning(`${siteId}-${skillId}`)
    setMessage(null)
    try {
      const res = await fetch('/api/skills/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteId, skillId }),
      })
      if (res.ok) {
        setMessage(`${skillName} queued to run`)
      } else {
        setMessage('Failed to queue skill run')
      }
    } catch {
      setMessage('Failed to queue skill run')
    }
    setRunning(null)
  }

  return (
    <div className="space-y-6">
      {message && (
        <div className="p-3 text-sm bg-green-50 text-success border border-green-200 rounded-md">
          {message}
        </div>
      )}

      {skills.map(skill => (
        <div key={skill.id} className="bg-background border border-border rounded-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <span className="text-xl">{skill.icon}</span>
                <div>
                  <h3 className="text-sm font-semibold text-text-primary">{skill.name}</h3>
                  <p className="text-xs text-text-muted mt-0.5">{skill.description}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-text-muted">Default: {skill.default_cadence}</span>
              </div>
            </div>
            <div className="mt-2 flex items-center gap-1">
              {skill.required_integrations?.map((i: string) => (
                <span key={i} className="text-xs px-1.5 py-0.5 bg-surface border border-border rounded text-text-muted">
                  {i.replace('_', ' ')}
                </span>
              ))}
            </div>
          </div>

          <div className="divide-y divide-border">
            {sites.map(site => {
              const active = isActive(site.id, skill.id)
              const runKey = `${site.id}-${skill.id}`
              const isRunning = running === runKey

              return (
                <div key={site.id} className="flex items-center justify-between px-5 py-3">
                  <div>
                    <span className="text-sm text-text-primary">{site.name}</span>
                    <span className="text-xs text-text-muted ml-2">{site.domain}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => runSkill(site.id, skill.id, skill.name)}
                      disabled={isRunning || !active}
                      className="text-xs text-text-muted hover:text-accent px-2 py-1 rounded hover:bg-surface-hover disabled:opacity-40 transition-colors"
                    >
                      {isRunning ? 'Running...' : 'Run now'}
                    </button>
                    <button
                      onClick={() => toggleSkill(site.id, skill.id)}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                        active ? 'bg-accent' : 'bg-border-strong'
                      }`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        active ? 'translate-x-4' : 'translate-x-0.5'
                      }`} />
                    </button>
                  </div>
                </div>
              )
            })}

            {!sites.length && (
              <div className="px-5 py-4 text-sm text-text-muted">
                No sites added yet
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
