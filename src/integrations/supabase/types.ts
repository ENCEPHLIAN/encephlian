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
      bank_accounts: {
        Row: {
          account_holder_name: string
          account_number_encrypted: string
          bank_name: string | null
          created_at: string | null
          id: string
          ifsc: string
          is_primary: boolean | null
          is_verified: boolean | null
          last_used_at: string | null
          penny_drop_reference: string | null
          user_id: string
          verified_at: string | null
        }
        Insert: {
          account_holder_name: string
          account_number_encrypted: string
          bank_name?: string | null
          created_at?: string | null
          id?: string
          ifsc: string
          is_primary?: boolean | null
          is_verified?: boolean | null
          last_used_at?: string | null
          penny_drop_reference?: string | null
          user_id: string
          verified_at?: string | null
        }
        Update: {
          account_holder_name?: string
          account_number_encrypted?: string
          bank_name?: string | null
          created_at?: string | null
          id?: string
          ifsc?: string
          is_primary?: boolean | null
          is_verified?: boolean | null
          last_used_at?: string | null
          penny_drop_reference?: string | null
          user_id?: string
          verified_at?: string | null
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
            foreignKeyName: "clinic_memberships_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "user_clinic_context"
            referencedColumns: ["clinic_id"]
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
          logo_url?: string | null
          name?: string
          primary_color?: string | null
          secondary_color?: string | null
          state?: string | null
          tz?: string | null
        }
        Relationships: []
      }
      commissions: {
        Row: {
          amount_inr: number
          commission_rate: number
          created_at: string | null
          id: string
          neurologist_id: string
          report_id: string
          sla: string
        }
        Insert: {
          amount_inr: number
          commission_rate: number
          created_at?: string | null
          id?: string
          neurologist_id: string
          report_id: string
          sla: string
        }
        Update: {
          amount_inr?: number
          commission_rate?: number
          created_at?: string | null
          id?: string
          neurologist_id?: string
          report_id?: string
          sla?: string
        }
        Relationships: [
          {
            foreignKeyName: "commissions_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      earnings_wallets: {
        Row: {
          balance_inr: number
          locked_amount_inr: number
          total_earned_inr: number
          updated_at: string | null
          user_id: string
        }
        Insert: {
          balance_inr?: number
          locked_amount_inr?: number
          total_earned_inr?: number
          updated_at?: string | null
          user_id: string
        }
        Update: {
          balance_inr?: number
          locked_amount_inr?: number
          total_earned_inr?: number
          updated_at?: string | null
          user_id?: string
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
      studies: {
        Row: {
          ai_draft_json: Json | null
          ai_draft_text: string | null
          clinic_id: string
          created_at: string | null
          duration_min: number | null
          id: string
          indication: string | null
          meta: Json | null
          montage: string | null
          original_format: string | null
          owner: string
          reference: string | null
          sample: boolean | null
          sla: string
          srate_hz: number | null
          state: string | null
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
          meta?: Json | null
          montage?: string | null
          original_format?: string | null
          owner: string
          reference?: string | null
          sample?: boolean | null
          sla?: string
          srate_hz?: number | null
          state?: string | null
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
          meta?: Json | null
          montage?: string | null
          original_format?: string | null
          owner?: string
          reference?: string | null
          sample?: boolean | null
          sla?: string
          srate_hz?: number | null
          state?: string | null
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
            foreignKeyName: "studies_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "user_clinic_context"
            referencedColumns: ["clinic_id"]
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
      tds_records: {
        Row: {
          created_at: string | null
          financial_year: string
          form_16a_url: string | null
          form_26q_filed: boolean | null
          id: string
          quarter: string
          total_earnings_inr: number
          total_tds_deducted_inr: number
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          financial_year: string
          form_16a_url?: string | null
          form_26q_filed?: boolean | null
          id?: string
          quarter: string
          total_earnings_inr?: number
          total_tds_deducted_inr?: number
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          financial_year?: string
          form_16a_url?: string | null
          form_26q_filed?: boolean | null
          id?: string
          quarter?: string
          total_earnings_inr?: number
          total_tds_deducted_inr?: number
          updated_at?: string | null
          user_id?: string
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
          {
            foreignKeyName: "user_roles_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "user_clinic_context"
            referencedColumns: ["clinic_id"]
          },
        ]
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
      withdrawal_requests: {
        Row: {
          admin_notes: string | null
          amount_inr: number
          bank_account_holder: string
          bank_account_number: string
          bank_ifsc: string
          bank_name: string | null
          created_at: string | null
          failed_reason: string | null
          form_16a_issued: boolean | null
          gross_amount_inr: number
          id: string
          net_amount_inr: number
          platform_fee_inr: number
          processed_at: string | null
          razorpay_payout_id: string | null
          status: string
          tds_amount_inr: number
          tds_deducted: boolean | null
          tds_quarter: string | null
          tier: string
          user_id: string
        }
        Insert: {
          admin_notes?: string | null
          amount_inr: number
          bank_account_holder: string
          bank_account_number: string
          bank_ifsc: string
          bank_name?: string | null
          created_at?: string | null
          failed_reason?: string | null
          form_16a_issued?: boolean | null
          gross_amount_inr: number
          id?: string
          net_amount_inr: number
          platform_fee_inr?: number
          processed_at?: string | null
          razorpay_payout_id?: string | null
          status?: string
          tds_amount_inr?: number
          tds_deducted?: boolean | null
          tds_quarter?: string | null
          tier: string
          user_id: string
        }
        Update: {
          admin_notes?: string | null
          amount_inr?: number
          bank_account_holder?: string
          bank_account_number?: string
          bank_ifsc?: string
          bank_name?: string | null
          created_at?: string | null
          failed_reason?: string | null
          form_16a_issued?: boolean | null
          gross_amount_inr?: number
          id?: string
          net_amount_inr?: number
          platform_fee_inr?: number
          processed_at?: string | null
          razorpay_payout_id?: string | null
          status?: string
          tds_amount_inr?: number
          tds_deducted?: boolean | null
          tds_quarter?: string | null
          tier?: string
          user_id?: string
        }
        Relationships: []
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
          {
            foreignKeyName: "clinic_memberships_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "user_clinic_context"
            referencedColumns: ["clinic_id"]
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
        Relationships: []
      }
    }
    Functions: {
      admin_adjust_tokens: {
        Args: { p_amount: number; p_operation: string; p_user_id: string }
        Returns: Json
      }
      admin_create_user: {
        Args: {
          p_email: string
          p_full_name: string
          p_password: string
          p_role: Database["public"]["Enums"]["app_role"]
        }
        Returns: Json
      }
      admin_revoke_role: {
        Args: {
          p_role: Database["public"]["Enums"]["app_role"]
          p_user_id: string
        }
        Returns: Json
      }
      admin_update_profile: {
        Args: { p_updates: Json; p_user_id: string }
        Returns: Json
      }
      admin_update_ticket_status: {
        Args: { p_status: string; p_ticket_id: string }
        Returns: Json
      }
      calculate_withdrawal_breakdown: {
        Args: { p_requested_amount: number; p_user_id: string }
        Returns: Json
      }
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
      unlock_failed_withdrawal: {
        Args: { p_withdrawal_id: string }
        Returns: Json
      }
    }
    Enums: {
      app_role: "neurologist" | "clinic_admin" | "ops" | "super_admin"
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
      app_role: ["neurologist", "clinic_admin", "ops", "super_admin"],
    },
  },
} as const
