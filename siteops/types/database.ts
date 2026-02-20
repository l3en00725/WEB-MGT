export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string
          full_name: string | null
          avatar_url: string | null
          created_at: string
        }
        Insert: {
          id: string
          email: string
          full_name?: string | null
          avatar_url?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          email?: string
          full_name?: string | null
          avatar_url?: string | null
          created_at?: string
        }
        Relationships: []
      }
      sites: {
        Row: {
          id: string
          owner_id: string
          name: string
          domain: string
          github_owner: string
          github_repo: string
          github_default_branch: string
          vercel_project_id: string | null
          vercel_team_id: string | null
          status: string
          gsc_property: string | null
          ga4_property_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          owner_id: string
          name: string
          domain: string
          github_owner: string
          github_repo: string
          github_default_branch?: string
          vercel_project_id?: string | null
          vercel_team_id?: string | null
          status?: string
          gsc_property?: string | null
          ga4_property_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          owner_id?: string
          name?: string
          domain?: string
          github_owner?: string
          github_repo?: string
          github_default_branch?: string
          vercel_project_id?: string | null
          vercel_team_id?: string | null
          status?: string
          gsc_property?: string | null
          ga4_property_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      site_tokens: {
        Row: {
          id: string
          site_id: string
          token_type: string
          access_token: string
          refresh_token: string | null
          expires_at: string | null
          scopes: string[] | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          site_id: string
          token_type: string
          access_token: string
          refresh_token?: string | null
          expires_at?: string | null
          scopes?: string[] | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          site_id?: string
          token_type?: string
          access_token?: string
          refresh_token?: string | null
          expires_at?: string | null
          scopes?: string[] | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      skills: {
        Row: {
          id: string
          slug: string
          name: string
          description: string
          icon: string
          default_cadence: string
          required_integrations: string[] | null
          is_available: boolean
          created_at: string
        }
        Insert: {
          id?: string
          slug: string
          name: string
          description: string
          icon: string
          default_cadence: string
          required_integrations?: string[] | null
          is_available?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          slug?: string
          name?: string
          description?: string
          icon?: string
          default_cadence?: string
          required_integrations?: string[] | null
          is_available?: boolean
          created_at?: string
        }
        Relationships: []
      }
      site_skills: {
        Row: {
          id: string
          site_id: string
          skill_id: string
          is_active: boolean
          cadence: string | null
          last_run_at: string | null
          next_run_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          site_id: string
          skill_id: string
          is_active?: boolean
          cadence?: string | null
          last_run_at?: string | null
          next_run_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          site_id?: string
          skill_id?: string
          is_active?: boolean
          cadence?: string | null
          last_run_at?: string | null
          next_run_at?: string | null
          created_at?: string
        }
        Relationships: []
      }
      skill_runs: {
        Row: {
          id: string
          site_id: string
          skill_id: string
          status: string
          triggered_by: string
          raw_gsc_data: Json | null
          raw_ga4_data: Json | null
          raw_crawl_data: Json | null
          raw_psi_data: Json | null
          error_message: string | null
          started_at: string
          completed_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          site_id: string
          skill_id: string
          status?: string
          triggered_by?: string
          raw_gsc_data?: Json | null
          raw_ga4_data?: Json | null
          raw_crawl_data?: Json | null
          raw_psi_data?: Json | null
          error_message?: string | null
          started_at?: string
          completed_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          site_id?: string
          skill_id?: string
          status?: string
          triggered_by?: string
          raw_gsc_data?: Json | null
          raw_ga4_data?: Json | null
          raw_crawl_data?: Json | null
          raw_psi_data?: Json | null
          error_message?: string | null
          started_at?: string
          completed_at?: string | null
          created_at?: string
        }
        Relationships: []
      }
      skill_results: {
        Row: {
          id: string
          skill_run_id: string
          site_id: string
          page_path: string
          file_path: string
          field_name: string
          change_type: string
          value_before: string
          value_after: string
          ai_reasoning: string
          priority: string
          status: string
          gsc_metric: Json | null
          ga4_metric: Json | null
          media_asset_id: string | null
          file_path_unresolved: boolean | null
          reviewed_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          skill_run_id: string
          site_id: string
          page_path: string
          file_path: string
          field_name: string
          change_type: string
          value_before: string
          value_after: string
          ai_reasoning: string
          priority?: string
          status?: string
          gsc_metric?: Json | null
          ga4_metric?: Json | null
          media_asset_id?: string | null
          file_path_unresolved?: boolean | null
          reviewed_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          skill_run_id?: string
          site_id?: string
          page_path?: string
          file_path?: string
          field_name?: string
          change_type?: string
          value_before?: string
          value_after?: string
          ai_reasoning?: string
          priority?: string
          status?: string
          gsc_metric?: Json | null
          ga4_metric?: Json | null
          media_asset_id?: string | null
          file_path_unresolved?: boolean | null
          reviewed_at?: string | null
          created_at?: string
        }
        Relationships: []
      }
      deploys: {
        Row: {
          id: string
          site_id: string
          deployed_by: string
          skill_result_ids: string[]
          github_branch: string
          github_commit_sha: string | null
          github_pr_url: string | null
          vercel_deployment_id: string | null
          vercel_preview_url: string | null
          vercel_production_url: string | null
          status: string
          promoted_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          site_id: string
          deployed_by: string
          skill_result_ids: string[]
          github_branch: string
          github_commit_sha?: string | null
          github_pr_url?: string | null
          vercel_deployment_id?: string | null
          vercel_preview_url?: string | null
          vercel_production_url?: string | null
          status?: string
          promoted_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          site_id?: string
          deployed_by?: string
          skill_result_ids?: string[]
          github_branch?: string
          github_commit_sha?: string | null
          github_pr_url?: string | null
          vercel_deployment_id?: string | null
          vercel_preview_url?: string | null
          vercel_production_url?: string | null
          status?: string
          promoted_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      media_assets: {
        Row: {
          id: string
          site_id: string
          owner_id: string
          filename: string
          original_filename: string
          storage_path: string
          public_url: string
          mime_type: string
          width_px: number | null
          height_px: number | null
          file_size_bytes: number | null
          is_discover_eligible: boolean | null
          alt_text: string | null
          tags: string[] | null
          created_at: string
        }
        Insert: {
          id?: string
          site_id: string
          owner_id: string
          filename: string
          original_filename: string
          storage_path: string
          public_url: string
          mime_type: string
          width_px?: number | null
          height_px?: number | null
          file_size_bytes?: number | null
          is_discover_eligible?: boolean | null
          alt_text?: string | null
          tags?: string[] | null
          created_at?: string
        }
        Update: {
          id?: string
          site_id?: string
          owner_id?: string
          filename?: string
          original_filename?: string
          storage_path?: string
          public_url?: string
          mime_type?: string
          width_px?: number | null
          height_px?: number | null
          file_size_bytes?: number | null
          is_discover_eligible?: boolean | null
          alt_text?: string | null
          tags?: string[] | null
          created_at?: string
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          id: string
          site_id: string | null
          user_id: string | null
          action: string
          details: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          site_id?: string | null
          user_id?: string | null
          action: string
          details?: Json | null
          created_at?: string
        }
        Update: {
          id?: string
          site_id?: string | null
          user_id?: string | null
          action?: string
          details?: Json | null
          created_at?: string
        }
        Relationships: []
      }
      psi_snapshots: {
        Row: {
          id: string
          site_id: string
          page_url: string
          strategy: string
          performance_score: number | null
          seo_score: number | null
          accessibility_score: number | null
          lcp_ms: number | null
          cls_score: number | null
          inp_ms: number | null
          fcp_ms: number | null
          ttfb_ms: number | null
          opportunities: Json | null
          raw_response: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          site_id: string
          page_url: string
          strategy: string
          performance_score?: number | null
          seo_score?: number | null
          accessibility_score?: number | null
          lcp_ms?: number | null
          cls_score?: number | null
          inp_ms?: number | null
          fcp_ms?: number | null
          ttfb_ms?: number | null
          opportunities?: Json | null
          raw_response?: Json | null
          created_at?: string
        }
        Update: {
          id?: string
          site_id?: string
          page_url?: string
          strategy?: string
          performance_score?: number | null
          seo_score?: number | null
          accessibility_score?: number | null
          lcp_ms?: number | null
          cls_score?: number | null
          inp_ms?: number | null
          fcp_ms?: number | null
          ttfb_ms?: number | null
          opportunities?: Json | null
          raw_response?: Json | null
          created_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

// Convenience type aliases
export type Profile = Database['public']['Tables']['profiles']['Row']
export type Site = Database['public']['Tables']['sites']['Row']
export type SiteToken = Database['public']['Tables']['site_tokens']['Row']
export type Skill = Database['public']['Tables']['skills']['Row']
export type SiteSkill = Database['public']['Tables']['site_skills']['Row']
export type SkillRun = Database['public']['Tables']['skill_runs']['Row']
export type SkillResult = Database['public']['Tables']['skill_results']['Row']
export type Deploy = Database['public']['Tables']['deploys']['Row']
export type MediaAsset = Database['public']['Tables']['media_assets']['Row']
export type AuditLog = Database['public']['Tables']['audit_log']['Row']
export type PSISnapshot = Database['public']['Tables']['psi_snapshots']['Row']
