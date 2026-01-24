export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      ai_drafts: {
        Row: {
          created_at: string | null
          draft: Json
          id: string
          model: string | null
          study_id: string | null
          version: string | null
        }
        Insert: {
          created_at?: string | null
          draft: Json
          id?: string
          model?: string | null
          study_id?: string | null
          version?: string | null
        }
        Update: {
          created_at?: string | null
          draft?: Json
          id?: string
          model?: string | null
          study_id?: string | null
          version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_drafts_study_id_fkey"
            columns: ["study_id"]
            isOneToOne: false
            referencedRelation: "studies"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          created_at: string
          event_data: Json | null
          event_type: string
          id: string
          ip_address: unknown
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          event_data?: Json | null
          event_type: string
          id?: string
          ip_address?: unknown
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          event_data?: Json | null
          event_type?: string
          id?: string
          ip_address?: unknown
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      canonical_eeg_records: {
        Row: {
          canonical_json: Json
          created_at: string
          id: string
          native_sampling_hz: number | null
          schema_version: string
          sfreq_model: number | null
          study_id: string
          tensor_path: string
        }
        Insert: {
          canonical_json: Json
          created_at?: string
          id?: string
          native_sampling_hz?: number | null
          schema_version?: string
          sfreq_model?: number | null
          study_id: string
          tensor_path: string
        }
        Update: {
          canonical_json?: Json
          created_at?: string
          id?: string
          native_sampling_hz?: number | null
          schema_version?: string
          sfreq_model?: number | null
          study_id?: string
          tensor_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "canonical_eeg_records_study_id_fkey"
            columns: ["study_id"]
            isOneToOne: true
            referencedRelation: "studies"
            referencedColumns: ["id"]
          },
        ]
      }
      clinic_memberships: {
        Row: {
          clinic_id: string
          role: string
          user_id: string
        }
        Insert: {
          clinic_id: string
          role?: string
          user_id: string
        }
        Update: {
          clinic_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinic_memberships_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinic_memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      clinics: {
        Row: {
          brand_name: string | null
          city: string | null
          country: string | null
          created_at: string | null
          custom_domain: string | null
          id: string
          is_active: boolean | null
          logo_url: string | null
          name: string
          primary_color: string | null
          secondary_color: string | null
          state: string | null
          tz: string | null
        }
        Insert: {
          brand_name?: string | null
          city?: string | null
          country?: string | null
          created_at?: string | null
          custom_domain?: string | null
          id?: string
          is_active?: boolean | null
          logo_url?: string | null
          name: string
          primary_color?: string | null
          secondary_color?: string | null
          state?: string | null
          tz?: string | null
        }
        Update: {
          brand_name?: string | null
          city?: string | null
          country?: string | null
          created_at?: string | null
          custom_domain?: string | null
          id?: string
          is_active?: boolean | null
          logo_url?: string | null
          name?: string
          primary_color?: string | null
          secondary_color?: string | null
          state?: string | null
          tz?: string | null
        }
        Relationships: []
      }
      eeg_markers: {
        Row: {
          channel: string | null
          created_at: string
          duration_sec: number | null
          id: string
          label: string | null
          marker_type: string
          notes: string | null
          severity: string | null
          study_id: string
          timestamp_sec: number
          updated_at: string
          user_id: string
        }
        Insert: {
          channel?: string | null
          created_at?: string
          duration_sec?: number | null
          id?: string
          label?: string | null
          marker_type: string
          notes?: string | null
          severity?: string | null
          study_id: string
          timestamp_sec: number
          updated_at?: string
          user_id: string
        }
        Update: {
          channel?: string | null
          created_at?: string
          duration_sec?: number | null
          id?: string
          label?: string | null
          marker_type?: string
          notes?: string | null
          severity?: string | null
          study_id?: string
          timestamp_sec?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "eeg_markers_study_id_fkey"
            columns: ["study_id"]
            isOneToOne: false
            referencedRelation: "studies"
            referencedColumns: ["id"]
          },
        ]
      }
      notes: {
        Row: {
          content: string
          created_at: string
          id: string
          is_pinned: boolean
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content?: string
          created_at?: string
          id?: string
          is_pinned?: boolean
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          is_pinned?: boolean
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount_inr: number
          created_at: string | null
          credits_purchased: number
          id: string
          order_id: string | null
          payment_id: string | null
          provider: string | null
          signature_valid: boolean | null
          status: string
          user_id: string
        }
        Insert: {
          amount_inr: number
          created_at?: string | null
          credits_purchased: number
          id?: string
          order_id?: string | null
          payment_id?: string | null
          provider?: string | null
          signature_valid?: boolean | null
          status?: string
          user_id: string
        }
        Update: {
          amount_inr?: number
          created_at?: string | null
          credits_purchased?: number
          id?: string
          order_id?: string | null
          payment_id?: string | null
          provider?: string | null
          signature_valid?: boolean | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      profiles: {
        Row: {
          company_name: string | null
          created_at: string | null
          credentials: string | null
          department: string | null
          email: string
          full_name: string | null
          hospital_affiliation: string | null
          id: string
          is_disabled: boolean | null
          medical_license_number: string | null
          phone_number: string | null
          role: string
          specialization: string | null
        }
        Insert: {
          company_name?: string | null
          created_at?: string | null
          credentials?: string | null
          department?: string | null
          email: string
          full_name?: string | null
          hospital_affiliation?: string | null
          id: string
          is_disabled?: boolean | null
          medical_license_number?: string | null
          phone_number?: string | null
          role?: string
          specialization?: string | null
        }
        Update: {
          company_name?: string | null
          created_at?: string | null
          credentials?: string | null
          department?: string | null
          email?: string
          full_name?: string | null
          hospital_affiliation?: string | null
          id?: string
          is_disabled?: boolean | null
          medical_license_number?: string | null
          phone_number?: string | null
          role?: string
          specialization?: string | null
        }
        Relationships: []
      }
      report_attachments: {
        Row: {
          created_at: string
          file_name: string
          file_path: string
          file_size: number | null
          id: string
          mime_type: string | null
          study_id: string | null
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          file_name: string
          file_path: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          study_id?: string | null
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          file_name?: string
          file_path?: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          study_id?: string | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "report_attachments_study_id_fkey"
            columns: ["study_id"]
            isOneToOne: false
            referencedRelation: "studies"
            referencedColumns: ["id"]
          },
        ]
      }
      report_templates: {
        Row: {
          created_at: string | null
          id: string
          name: string
          style_config: Json | null
          template_content: Json
          type: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          style_config?: Json | null
          template_content: Json
          type?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          style_config?: Json | null
          template_content?: Json
          type?: string | null
        }
        Relationships: []
      }
      reports: {
        Row: {
          content: Json
          created_at: string | null
          id: string
          interpreter: string | null
          pdf_path: string | null
          signed_at: string | null
          status: string | null
          study_id: string | null
        }
        Insert: {
          content: Json
          created_at?: string | null
          id?: string
          interpreter?: string | null
          pdf_path?: string | null
          signed_at?: string | null
          status?: string | null
          study_id?: string | null
        }
        Update: {
          content?: Json
          created_at?: string | null
          id?: string
          interpreter?: string | null
          pdf_path?: string | null
          signed_at?: string | null
          status?: string | null
          study_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reports_interpreter_fkey"
            columns: ["interpreter"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_study_id_fkey"
            columns: ["study_id"]
            isOneToOne: true
            referencedRelation: "studies"
            referencedColumns: ["id"]
          },
        ]
      }
      review_events: {
        Row: {
          actor: string | null
          created_at: string | null
          event: string | null
          id: string
          payload: Json | null
          study_id: string | null
        }
        Insert: {
          actor?: string | null
          created_at?: string | null
          event?: string | null
          id?: string
          payload?: Json | null
          study_id?: string | null
        }
        Update: {
          actor?: string | null
          created_at?: string | null
          event?: string | null
          id?: string
          payload?: Json | null
          study_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "review_events_actor_fkey"
            columns: ["actor"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_events_study_id_fkey"
            columns: ["study_id"]
            isOneToOne: false
            referencedRelation: "studies"
            referencedColumns: ["id"]
          },
        ]
      }
      service_health_logs: {
        Row: {
          checked_at: string | null
          checked_by: string | null
          id: string
          last_error_at: string | null
          last_error_message: string | null
          last_success_at: string | null
          service_name: string
          status: string
        }
        Insert: {
          checked_at?: string | null
          checked_by?: string | null
          id?: string
          last_error_at?: string | null
          last_error_message?: string | null
          last_success_at?: string | null
          service_name: string
          status?: string
        }
        Update: {
          checked_at?: string | null
          checked_by?: string | null
          id?: string
          last_error_at?: string | null
          last_error_message?: string | null
          last_success_at?: string | null
          service_name?: string
          status?: string
        }
        Relationships: []
      }
      storage_lifecycle_policies: {
        Row: {
          bucket_id: string
          created_at: string
          id: string
          is_active: boolean
          retention_days: number
          updated_at: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          retention_days?: number
          updated_at?: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          retention_days?: number
          updated_at?: string
        }
        Relationships: []
      }
      studies: {
        Row: {
          ai_draft_json: Json | null
          ai_draft_text: string | null
          clinic_id: string
          created_at: string | null
          duration_min: number | null
          id: string
          indication: string | null
          latest_run_id: string | null
          meta: Json | null
          montage: string | null
          original_format: string | null
          owner: string
          reference: string | null
          refund_processed_at: string | null
          refund_reason: string | null
          refund_requested: boolean | null
          report_locked: boolean | null
          sample: boolean | null
          sla: string
          sla_selected_at: string | null
          srate_hz: number | null
          state: string | null
          storage_backend: string | null
          storage_ref: string | null
          study_key: string | null
          tokens_deducted: number | null
          triage_completed_at: string | null
          triage_progress: number | null
          triage_started_at: string | null
          triage_status: string | null
          uploaded_file_path: string | null
        }
        Insert: {
          ai_draft_json?: Json | null
          ai_draft_text?: string | null
          clinic_id: string
          created_at?: string | null
          duration_min?: number | null
          id?: string
          indication?: string | null
          latest_run_id?: string | null
          meta?: Json | null
          montage?: string | null
          original_format?: string | null
          owner: string
          reference?: string | null
          refund_processed_at?: string | null
          refund_reason?: string | null
          refund_requested?: boolean | null
          report_locked?: boolean | null
          sample?: boolean | null
          sla?: string
          sla_selected_at?: string | null
          srate_hz?: number | null
          state?: string | null
          storage_backend?: string | null
          storage_ref?: string | null
          study_key?: string | null
          tokens_deducted?: number | null
          triage_completed_at?: string | null
          triage_progress?: number | null
          triage_started_at?: string | null
          triage_status?: string | null
          uploaded_file_path?: string | null
        }
        Update: {
          ai_draft_json?: Json | null
          ai_draft_text?: string | null
          clinic_id?: string
          created_at?: string | null
          duration_min?: number | null
          id?: string
          indication?: string | null
          latest_run_id?: string | null
          meta?: Json | null
          montage?: string | null
          original_format?: string | null
          owner?: string
          reference?: string | null
          refund_processed_at?: string | null
          refund_reason?: string | null
          refund_requested?: boolean | null
          report_locked?: boolean | null
          sample?: boolean | null
          sla?: string
          sla_selected_at?: string | null
          srate_hz?: number | null
          state?: string | null
          storage_backend?: string | null
          storage_ref?: string | null
          study_key?: string | null
          tokens_deducted?: number | null
          triage_completed_at?: string | null
          triage_progress?: number | null
          triage_started_at?: string | null
          triage_status?: string | null
          uploaded_file_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "studies_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studies_owner_fkey"
            columns: ["owner"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      study_files: {
        Row: {
          checksum: string | null
          created_at: string | null
          id: string
          kind: string
          path: string
          size_bytes: number | null
          study_id: string
        }
        Insert: {
          checksum?: string | null
          created_at?: string | null
          id?: string
          kind: string
          path: string
          size_bytes?: number | null
          study_id: string
        }
        Update: {
          checksum?: string | null
          created_at?: string | null
          id?: string
          kind?: string
          path?: string
          size_bytes?: number | null
          study_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "study_files_study_id_fkey"
            columns: ["study_id"]
            isOneToOne: false
            referencedRelation: "studies"
            referencedColumns: ["id"]
          },
        ]
      }
      study_reports: {
        Row: {
          content: Json
          created_at: string | null
          created_by: string | null
          id: string
          report_html: string | null
          run_id: string | null
          study_id: string
        }
        Insert: {
          content?: Json
          created_at?: string | null
          created_by?: string | null
          id?: string
          report_html?: string | null
          run_id?: string | null
          study_id: string
        }
        Update: {
          content?: Json
          created_at?: string | null
          created_by?: string | null
          id?: string
          report_html?: string | null
          run_id?: string | null
          study_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "study_reports_study_id_fkey"
            columns: ["study_id"]
            isOneToOne: false
            referencedRelation: "studies"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          created_at: string
          id: string
          message: string
          status: string
          subject: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          status?: string
          subject: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          status?: string
          subject?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      tfa_secrets: {
        Row: {
          backup_codes: string[] | null
          created_at: string | null
          encrypted_secret: string
          is_enabled: boolean
          user_id: string
          verified_at: string | null
        }
        Insert: {
          backup_codes?: string[] | null
          created_at?: string | null
          encrypted_secret: string
          is_enabled?: boolean
          user_id: string
          verified_at?: string | null
        }
        Update: {
          backup_codes?: string[] | null
          created_at?: string | null
          encrypted_secret?: string
          is_enabled?: boolean
          user_id?: string
          verified_at?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          clinic_id: string | null
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          clinic_id?: string | null
          created_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          clinic_id?: string | null
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet_transactions: {
        Row: {
          amount: number
          balance_after: number
          balance_before: number
          created_at: string | null
          id: string
          operation: string
          performed_by: string | null
          reason: string | null
          user_id: string
        }
        Insert: {
          amount: number
          balance_after: number
          balance_before: number
          created_at?: string | null
          id?: string
          operation: string
          performed_by?: string | null
          reason?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          balance_after?: number
          balance_before?: number
          created_at?: string | null
          id?: string
          operation?: string
          performed_by?: string | null
          reason?: string | null
          user_id?: string
        }
        Relationships: []
      }
      wallets: {
        Row: {
          tokens: number
          updated_at: string | null
          user_id: string
        }
        Insert: {
          tokens?: number
          updated_at?: string | null
          user_id: string
        }
        Update: {
          tokens?: number
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      my_memberships: {
        Row: {
          clinic_id: string | null
          clinic_role: string | null
        }
        Insert: {
          clinic_id?: string | null
          clinic_role?: string | null
        }
        Update: {
          clinic_id?: string | null
          clinic_role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clinic_memberships_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      user_clinic_context: {
        Row: {
          brand_name: string | null
          clinic_id: string | null
          clinic_name: string | null
          logo_url: string | null
          primary_color: string | null
          role: Database["public"]["Enums"]["app_role"] | null
          secondary_color: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      admin_adjust_tokens: {
        Args: { p_amount: number; p_operation: string; p_user_id: string }
        Returns: Json
      }
      admin_create_clinic: {
        Args: { p_admin_user_id?: string; p_city?: string; p_name: string }
        Returns: Json
      }
      admin_delete_clinic: { Args: { p_clinic_id: string }; Returns: Json }
      admin_delete_study: { Args: { p_study_id: string }; Returns: Json }
      admin_delete_test_files: { Args: { p_file_ids: string[] }; Returns: Json }
      admin_delete_user: { Args: { p_user_id: string }; Returns: Json }
      admin_full_reset_user: { Args: { p_user_id: string }; Returns: Json }
      admin_get_all_clinics: {
        Args: never
        Returns: {
          city: string
          created_at: string
          id: string
          is_active: boolean
          member_count: number
          name: string
          study_count: number
        }[]
      }
      admin_get_all_studies: {
        Args: never
        Returns: {
          ai_draft_json: Json | null
          ai_draft_text: string | null
          clinic_id: string
          created_at: string | null
          duration_min: number | null
          id: string
          indication: string | null
          latest_run_id: string | null
          meta: Json | null
          montage: string | null
          original_format: string | null
          owner: string
          reference: string | null
          refund_processed_at: string | null
          refund_reason: string | null
          refund_requested: boolean | null
          report_locked: boolean | null
          sample: boolean | null
          sla: string
          sla_selected_at: string | null
          srate_hz: number | null
          state: string | null
          storage_backend: string | null
          storage_ref: string | null
          study_key: string | null
          tokens_deducted: number | null
          triage_completed_at: string | null
          triage_progress: number | null
          triage_started_at: string | null
          triage_status: string | null
          uploaded_file_path: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "studies"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      admin_get_all_users: {
        Args: never
        Returns: {
          app_roles: Json
          clinics: Json
          created_at: string
          email: string
          full_name: string
          id: string
          is_disabled: boolean
          profile_role: string
          tokens: number
        }[]
      }
      admin_get_all_wallets: {
        Args: never
        Returns: {
          email: string
          full_name: string
          tokens: number
          updated_at: string
          user_id: string
        }[]
      }
      admin_get_clinics_for_dropdown: {
        Args: never
        Returns: {
          id: string
          name: string
        }[]
      }
      admin_get_dashboard_stats: { Args: never; Returns: Json }
      admin_get_recent_audit_logs: {
        Args: { p_limit?: number }
        Returns: {
          actor_email: string
          actor_id: string
          created_at: string
          event_data: Json
          event_type: string
          id: string
        }[]
      }
      admin_grant_role: {
        Args: {
          p_clinic_id?: string
          p_role: Database["public"]["Enums"]["app_role"]
          p_user_id: string
        }
        Returns: Json
      }
      admin_log_event: {
        Args: { p_event: string; p_payload?: Json; p_study_id: string }
        Returns: Json
      }
      admin_manage_clinic_membership: {
        Args: {
          p_action: string
          p_clinic_id: string
          p_role?: string
          p_user_id: string
        }
        Returns: Json
      }
      admin_push_eeg_to_user: {
        Args: {
          p_clinic_id: string
          p_file_path: string
          p_meta?: Json
          p_user_id: string
        }
        Returns: Json
      }
      admin_reset_user_tfa: { Args: { p_user_id: string }; Returns: Json }
      admin_restore_to_date: {
        Args: { p_cutoff_date: string; p_user_id: string }
        Returns: Json
      }
      admin_revoke_role: {
        Args: {
          p_role: Database["public"]["Enums"]["app_role"]
          p_user_id: string
        }
        Returns: Json
      }
      admin_scan_test_files: {
        Args: never
        Returns: {
          clinic_name: string
          created_at: string
          file_id: string
          file_kind: string
          file_path: string
          study_id: string
        }[]
      }
      admin_setup_tfa: { Args: { p_secret: string }; Returns: Json }
      admin_suspend_user: {
        Args: { p_suspend?: boolean; p_user_id: string }
        Returns: Json
      }
      admin_update_clinic: {
        Args: { p_clinic_id: string; p_updates: Json }
        Returns: Json
      }
      admin_update_platform_setting: {
        Args: { p_key: string; p_value: Json }
        Returns: Json
      }
      admin_update_profile: {
        Args: { p_updates: Json; p_user_id: string }
        Returns: Json
      }
      admin_update_study: {
        Args: { p_study_id: string; p_updates: Json }
        Returns: Json
      }
      admin_update_ticket_status: {
        Args: { p_status: string; p_ticket_id: string }
        Returns: Json
      }
      admin_verify_tfa: { Args: never; Returns: Json }
      calculate_withdrawal_breakdown: {
        Args: { p_requested_amount: number; p_user_id: string }
        Returns: Json
      }
      check_tfa_status: { Args: never; Returns: Json }
      consume_credit_and_sign: {
        Args: {
          p_content: Json
          p_cost: number
          p_study_id: string
          p_user_id: string
        }
        Returns: Json
      }
      credit_wallet: {
        Args: { p_tokens: number; p_user_id: string }
        Returns: undefined
      }
      get_current_fy: { Args: never; Returns: string }
      get_current_quarter: { Args: never; Returns: string }
      get_files_for_cleanup: {
        Args: never
        Returns: {
          bucket_id: string
          created_at: string
          file_id: string
          file_path: string
          retention_days: number
          study_id: string
        }[]
      }
      get_platform_setting: { Args: { p_key: string }; Returns: Json }
      get_tfa_secret: { Args: never; Returns: string }
      get_user_clinic_id: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      lock_withdrawal_amount: {
        Args: { p_amount: number; p_user_id: string }
        Returns: boolean
      }
      process_completed_withdrawal: {
        Args: { p_withdrawal_id: string }
        Returns: Json
      }
      request_token_refund: {
        Args: { p_reason?: string; p_study_id: string }
        Returns: Json
      }
      select_sla_and_start_triage: {
        Args: { p_sla: string; p_study_id: string }
        Returns: Json
      }
      unlock_failed_withdrawal: {
        Args: { p_withdrawal_id: string }
        Returns: Json
      }
    }
    Enums: {
      app_role:
        | "neurologist"
        | "clinic_admin"
        | "ops"
        | "super_admin"
        | "management"
        | "clinician"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: [
        "neurologist",
        "clinic_admin",
        "ops",
        "super_admin",
        "management",
        "clinician",
      ],
    },
  },
} as const
