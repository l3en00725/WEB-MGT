-- SiteOps Initial Schema Migration
-- Run this in Supabase SQL Editor

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =========================================
-- PROFILES TABLE (extends auth.users)
-- =========================================
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (id = auth.uid());

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (id = auth.uid());

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- =========================================
-- SITES TABLE
-- =========================================
CREATE TABLE IF NOT EXISTS sites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  domain TEXT NOT NULL,
  github_owner TEXT NOT NULL,
  github_repo TEXT NOT NULL,
  github_default_branch TEXT NOT NULL DEFAULT 'main',
  vercel_project_id TEXT,
  vercel_team_id TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused')),
  gsc_property TEXT,
  ga4_property_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE sites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can only access their own sites"
  ON sites FOR ALL
  USING (owner_id = auth.uid());

-- =========================================
-- SITE_TOKENS TABLE
-- =========================================
CREATE TABLE IF NOT EXISTS site_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  token_type TEXT NOT NULL CHECK (token_type IN ('github', 'vercel', 'google_oauth', 'keywords_everywhere')),
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  expires_at TIMESTAMPTZ,
  scopes TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(site_id, token_type)
);

ALTER TABLE site_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can only access tokens for their sites"
  ON site_tokens FOR ALL
  USING (
    site_id IN (
      SELECT id FROM sites WHERE owner_id = auth.uid()
    )
  );

-- =========================================
-- SKILLS TABLE
-- =========================================
CREATE TABLE IF NOT EXISTS skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  icon TEXT NOT NULL,
  default_cadence TEXT NOT NULL,
  required_integrations TEXT[],
  is_available BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE skills ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Skills are readable by all authenticated users"
  ON skills FOR SELECT
  USING (auth.role() = 'authenticated');

-- Seed skills data
INSERT INTO skills (slug, name, description, icon, default_cadence, required_integrations) VALUES
  ('seo-audit', 'SEO Audit', 'Analyzes GSC data, meta tags, headings, and page content to surface ranking improvement opportunities.', '◎', '0 9 * * 1', ARRAY['google_oauth', 'github']),
  ('google-discover', 'Google Discover', 'Audits image dimensions, E-E-A-T signals, content freshness, og:image tags, and structured data for Discover eligibility.', '◈', '0 9 * * 1', ARRAY['google_oauth', 'github']),
  ('conversion', 'Conversion', 'Cross-references GA4 bounce rate and session data with page content to identify CTA, copy, and UX improvements.', '◇', '0 9 * * 3', ARRAY['google_oauth', 'github']),
  ('technical-seo', 'Technical SEO', 'Checks Core Web Vitals, missing schema markup, broken internal links, crawlability, and robots.txt issues.', '◉', '0 9 * * 1', ARRAY['google_oauth', 'github'])
ON CONFLICT (slug) DO NOTHING;

-- =========================================
-- SITE_SKILLS TABLE
-- =========================================
CREATE TABLE IF NOT EXISTS site_skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  is_active BOOLEAN DEFAULT TRUE,
  cadence TEXT,
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(site_id, skill_id)
);

ALTER TABLE site_skills ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can only access site_skills for their sites"
  ON site_skills FOR ALL
  USING (
    site_id IN (
      SELECT id FROM sites WHERE owner_id = auth.uid()
    )
  );

-- =========================================
-- SKILL_RUNS TABLE
-- =========================================
CREATE TABLE IF NOT EXISTS skill_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
  triggered_by TEXT NOT NULL DEFAULT 'cron' CHECK (triggered_by IN ('cron', 'manual')),
  raw_gsc_data JSONB,
  raw_ga4_data JSONB,
  raw_crawl_data JSONB,
  raw_psi_data JSONB,
  error_message TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE skill_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can only access skill_runs for their sites"
  ON skill_runs FOR ALL
  USING (
    site_id IN (
      SELECT id FROM sites WHERE owner_id = auth.uid()
    )
  );

CREATE INDEX ON skill_runs (site_id, created_at DESC);

-- =========================================
-- SKILL_RESULTS TABLE
-- =========================================
CREATE TABLE IF NOT EXISTS skill_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_run_id UUID NOT NULL REFERENCES skill_runs(id) ON DELETE CASCADE,
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  page_path TEXT NOT NULL,
  file_path TEXT NOT NULL,
  field_name TEXT NOT NULL,
  change_type TEXT NOT NULL CHECK (change_type IN ('content', 'metadata', 'schema', 'image', 'code')),
  value_before TEXT NOT NULL,
  value_after TEXT NOT NULL,
  ai_reasoning TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('high', 'medium', 'low')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  gsc_metric JSONB,
  ga4_metric JSONB,
  media_asset_id UUID REFERENCES media_assets(id),
  file_path_unresolved BOOLEAN DEFAULT FALSE,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE skill_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can only access skill_results for their sites"
  ON skill_results FOR ALL
  USING (
    site_id IN (
      SELECT id FROM sites WHERE owner_id = auth.uid()
    )
  );

CREATE INDEX ON skill_results (site_id, status, created_at DESC);

-- =========================================
-- MEDIA_ASSETS TABLE
-- =========================================
CREATE TABLE IF NOT EXISTS media_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  public_url TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  width_px INTEGER,
  height_px INTEGER,
  file_size_bytes INTEGER,
  is_discover_eligible BOOLEAN,
  alt_text TEXT,
  tags TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE media_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can only access media_assets for their sites"
  ON media_assets FOR ALL
  USING (
    site_id IN (
      SELECT id FROM sites WHERE owner_id = auth.uid()
    )
  );

-- =========================================
-- DEPLOYS TABLE
-- =========================================
CREATE TABLE IF NOT EXISTS deploys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  deployed_by UUID NOT NULL REFERENCES profiles(id),
  skill_result_ids UUID[] NOT NULL,
  github_branch TEXT NOT NULL,
  github_commit_sha TEXT,
  github_pr_url TEXT,
  vercel_deployment_id TEXT,
  vercel_preview_url TEXT,
  vercel_production_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'preview_ready', 'promoted', 'failed', 'cancelled')),
  promoted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE deploys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can only access deploys for their sites"
  ON deploys FOR ALL
  USING (
    site_id IN (
      SELECT id FROM sites WHERE owner_id = auth.uid()
    )
  );

CREATE INDEX ON deploys (site_id, created_at DESC);

-- =========================================
-- AUDIT_LOG TABLE
-- =========================================
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID REFERENCES sites(id) ON DELETE SET NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view audit_log for their sites"
  ON audit_log FOR SELECT
  USING (
    site_id IN (
      SELECT id FROM sites WHERE owner_id = auth.uid()
    )
    OR user_id = auth.uid()
  );

CREATE POLICY "Authenticated users can insert audit_log"
  ON audit_log FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE INDEX ON audit_log (site_id, created_at DESC);

-- =========================================
-- PSI_SNAPSHOTS TABLE
-- =========================================
CREATE TABLE IF NOT EXISTS psi_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  page_url TEXT NOT NULL,
  strategy TEXT NOT NULL CHECK (strategy IN ('mobile', 'desktop')),
  performance_score INTEGER,
  seo_score INTEGER,
  accessibility_score INTEGER,
  lcp_ms INTEGER,
  cls_score NUMERIC(6,4),
  inp_ms INTEGER,
  fcp_ms INTEGER,
  ttfb_ms INTEGER,
  opportunities JSONB,
  raw_response JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE psi_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can only access psi_snapshots for their sites"
  ON psi_snapshots FOR ALL
  USING (
    site_id IN (
      SELECT id FROM sites WHERE owner_id = auth.uid()
    )
  );

CREATE INDEX ON psi_snapshots (site_id, created_at DESC);

-- =========================================
-- UPDATED_AT TRIGGERS
-- =========================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_sites_updated_at
  BEFORE UPDATE ON sites
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_site_tokens_updated_at
  BEFORE UPDATE ON site_tokens
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_deploys_updated_at
  BEFORE UPDATE ON deploys
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
