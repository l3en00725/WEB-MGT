-- Google Ads Integration Migration
-- Run this in Supabase SQL Editor after 001_initial_schema.sql

-- Add Google Ads customer ID to sites
ALTER TABLE sites ADD COLUMN IF NOT EXISTS ads_customer_id TEXT;

-- Add execution_target to skill_results
-- 'github' = change applies to a file in the repo (default, goes through deploy pipeline)
-- 'google_ads' = recommendation to apply manually in Google Ads UI
ALTER TABLE skill_results ADD COLUMN IF NOT EXISTS execution_target TEXT NOT NULL DEFAULT 'github'
  CHECK (execution_target IN ('github', 'google_ads'));

-- Seed new Ads Optimization skill
INSERT INTO skills (slug, name, description, icon, default_cadence, required_integrations)
VALUES (
  'ads-optimization',
  'Ads Optimization',
  'Analyzes Google Ads campaign performance, keyword Quality Scores, and search term data. Proposes ad copy improvements, landing page fixes to boost Quality Score, and keyword opportunities cross-referenced with organic GSC data.',
  '◑',
  '0 9 * * 3',
  ARRAY['google_ads', 'google_oauth', 'github']
)
ON CONFLICT (slug) DO NOTHING;
