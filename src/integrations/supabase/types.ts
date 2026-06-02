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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string | null
          actor_email: string | null
          actor_role: string | null
          after_state: Json | null
          before_state: Json | null
          created_at: string
          db_role: string | null
          event_data: Json | null
          event_type: string
          hash_prev: string | null
          hash_self: string | null
          id: string
          ip_address: unknown
          request_id: string | null
          resource_id: string | null
          resource_type: string | null
          session_id: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action?: string | null
          actor_email?: string | null
          actor_role?: string | null
          after_state?: Json | null
          before_state?: Json | null
          created_at?: string
          db_role?: string | null
          event_data?: Json | null
          event_type: string
          hash_prev?: string | null
          hash_self?: string | null
          id?: string
          ip_address?: unknown
          request_id?: string | null
          resource_id?: string | null
          resource_type?: string | null
          session_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string | null
          actor_email?: string | null
          actor_role?: string | null
          after_state?: Json | null
          before_state?: Json | null
          created_at?: string
          db_role?: string | null
          event_data?: Json | null
          event_type?: string
          hash_prev?: string | null
          hash_self?: string | null
          id?: string
          ip_address?: unknown
          request_id?: string | null
          resource_id?: string | null
          resource_type?: string | null
          session_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      channel_quality_assessments: {
        Row: {
          assessed_at: string
          channel_label: string
          confidence: number | null
          details: Json | null
          id: string
          quality_class: string
          source: string
          source_model_id: string | null
          source_version: string | null
          study_id: string
        }
        Insert: {
          assessed_at?: string
          channel_label: string
          confidence?: number | null
          details?: Json | null
          id?: string
          quality_class: string
          source: string
          source_model_id?: string | null
          source_version?: string | null
          study_id: string
        }
        Update: {
          assessed_at?: string
          channel_label?: string
          confidence?: number | null
          details?: Json | null
          id?: string
          quality_class?: string
          source?: string
          source_model_id?: string | null
          source_version?: string | null
          study_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_quality_assessments_source_model_id_fkey"
            columns: ["source_model_id"]
            isOneToOne: false
            referencedRelation: "model_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_quality_assessments_study_id_fkey"
            columns: ["study_id"]
            isOneToOne: false
            referencedRelation: "studies"
            referencedColumns: ["id"]
          },
        ]
      }
      clinic_documents: {
        Row: {
          clinic_id: string
          countersigned_at: string | null
          countersigned_by: string | null
          created_at: string
          created_by: string | null
          doc_type: string
          effective_date: string | null
          expiry_date: string | null
          file_mime: string | null
          file_path: string | null
          file_sha256: string | null
          file_size_bytes: number | null
          id: string
          notes: string | null
          parent_document_id: string | null
          sent_at: string | null
          sent_by: string | null
          signature_method: string
          signature_provider_envelope_id: string | null
          signed_at: string | null
          signed_by_email: string | null
          signed_by_name: string | null
          signed_by_role: string | null
          signed_ip: unknown
          status: string
          updated_at: string
          version: number
          viewed_at: string | null
        }
        Insert: {
          clinic_id: string
          countersigned_at?: string | null
          countersigned_by?: string | null
          created_at?: string
          created_by?: string | null
          doc_type: string
          effective_date?: string | null
          expiry_date?: string | null
          file_mime?: string | null
          file_path?: string | null
          file_sha256?: string | null
          file_size_bytes?: number | null
          id?: string
          notes?: string | null
          parent_document_id?: string | null
          sent_at?: string | null
          sent_by?: string | null
          signature_method?: string
          signature_provider_envelope_id?: string | null
          signed_at?: string | null
          signed_by_email?: string | null
          signed_by_name?: string | null
          signed_by_role?: string | null
          signed_ip?: unknown
          status?: string
          updated_at?: string
          version?: number
          viewed_at?: string | null
        }
        Update: {
          clinic_id?: string
          countersigned_at?: string | null
          countersigned_by?: string | null
          created_at?: string
          created_by?: string | null
          doc_type?: string
          effective_date?: string | null
          expiry_date?: string | null
          file_mime?: string | null
          file_path?: string | null
          file_sha256?: string | null
          file_size_bytes?: number | null
          id?: string
          notes?: string | null
          parent_document_id?: string | null
          sent_at?: string | null
          sent_by?: string | null
          signature_method?: string
          signature_provider_envelope_id?: string | null
          signed_at?: string | null
          signed_by_email?: string | null
          signed_by_name?: string | null
          signed_by_role?: string | null
          signed_ip?: unknown
          status?: string
          updated_at?: string
          version?: number
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clinic_documents_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinic_activation_status"
            referencedColumns: ["clinic_id"]
          },
          {
            foreignKeyName: "clinic_documents_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinic_documents_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "user_clinic_context"
            referencedColumns: ["clinic_id"]
          },
          {
            foreignKeyName: "clinic_documents_countersigned_by_fkey"
            columns: ["countersigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinic_documents_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinic_documents_parent_document_id_fkey"
            columns: ["parent_document_id"]
            isOneToOne: false
            referencedRelation: "clinic_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinic_documents_sent_by_fkey"
            columns: ["sent_by"]
            isOneToOne: false
            referencedRelation: "profiles"
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
            referencedRelation: "clinic_activation_status"
            referencedColumns: ["clinic_id"]
          },
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
      clinician_edit_deltas: {
        Row: {
          client_request_id: string | null
          clinician_id: string
          created_at: string
          edit_type: string
          field_id: string
          id: string
          information_value: number | null
          new_value: Json | null
          original_derived_from: string | null
          original_value: Json | null
          reason_code: string | null
          reason_text: string | null
          source_emission_id: string | null
          study_id: string
        }
        Insert: {
          client_request_id?: string | null
          clinician_id: string
          created_at?: string
          edit_type: string
          field_id: string
          id?: string
          information_value?: number | null
          new_value?: Json | null
          original_derived_from?: string | null
          original_value?: Json | null
          reason_code?: string | null
          reason_text?: string | null
          source_emission_id?: string | null
          study_id: string
        }
        Update: {
          client_request_id?: string | null
          clinician_id?: string
          created_at?: string
          edit_type?: string
          field_id?: string
          id?: string
          information_value?: number | null
          new_value?: Json | null
          original_derived_from?: string | null
          original_value?: Json | null
          reason_code?: string | null
          reason_text?: string | null
          source_emission_id?: string | null
          study_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinician_edit_deltas_source_emission_id_fkey"
            columns: ["source_emission_id"]
            isOneToOne: false
            referencedRelation: "report_emission_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinician_edit_deltas_study_id_fkey"
            columns: ["study_id"]
            isOneToOne: false
            referencedRelation: "studies"
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
          sku: string
          sku_config: Json | null
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
          sku?: string
          sku_config?: Json | null
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
          sku?: string
          sku_config?: Json | null
          state?: string | null
          tz?: string | null
        }
        Relationships: []
      }
      model_calibration_runs: {
        Row: {
          brier_score: number | null
          ece: number | null
          holdout_set_label: string
          id: string
          measured_at: string
          measured_by: string | null
          model_version_id: string
          n_samples: number
          notes: string | null
          platt_a: number | null
          platt_b: number | null
          reliability_diagram: Json | null
          threshold_metrics: Json | null
        }
        Insert: {
          brier_score?: number | null
          ece?: number | null
          holdout_set_label: string
          id?: string
          measured_at?: string
          measured_by?: string | null
          model_version_id: string
          n_samples: number
          notes?: string | null
          platt_a?: number | null
          platt_b?: number | null
          reliability_diagram?: Json | null
          threshold_metrics?: Json | null
        }
        Update: {
          brier_score?: number | null
          ece?: number | null
          holdout_set_label?: string
          id?: string
          measured_at?: string
          measured_by?: string | null
          model_version_id?: string
          n_samples?: number
          notes?: string | null
          platt_a?: number | null
          platt_b?: number | null
          reliability_diagram?: Json | null
          threshold_metrics?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "model_calibration_runs_model_version_id_fkey"
            columns: ["model_version_id"]
            isOneToOne: false
            referencedRelation: "model_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      model_validation_runs: {
        Row: {
          corpus_name: string
          corpus_version: string | null
          id: string
          metrics: Json
          model_version_id: string
          n_files: number
          n_samples: number
          notes: string | null
          report_blob_path: string | null
          run_at: string
          run_by: string | null
          script_blob_path: string | null
          verdict: string
        }
        Insert: {
          corpus_name: string
          corpus_version?: string | null
          id?: string
          metrics: Json
          model_version_id: string
          n_files: number
          n_samples: number
          notes?: string | null
          report_blob_path?: string | null
          run_at?: string
          run_by?: string | null
          script_blob_path?: string | null
          verdict: string
        }
        Update: {
          corpus_name?: string
          corpus_version?: string | null
          id?: string
          metrics?: Json
          model_version_id?: string
          n_files?: number
          n_samples?: number
          notes?: string | null
          report_blob_path?: string | null
          run_at?: string
          run_by?: string | null
          script_blob_path?: string | null
          verdict?: string
        }
        Relationships: [
          {
            foreignKeyName: "model_validation_runs_model_version_id_fkey"
            columns: ["model_version_id"]
            isOneToOne: false
            referencedRelation: "model_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      model_versions: {
        Row: {
          created_at: string
          created_by: string | null
          deployed_at: string | null
          deprecated_at: string | null
          emits_schema_name: string | null
          emits_schema_version: string | null
          family: string
          id: string
          model_card_url: string | null
          name: string
          notes: string | null
          status: string
          training_corpus: string | null
          updated_at: string
          validation_metrics: Json | null
          version: string
          weights_blob_path: string | null
          weights_sha256: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deployed_at?: string | null
          deprecated_at?: string | null
          emits_schema_name?: string | null
          emits_schema_version?: string | null
          family: string
          id?: string
          model_card_url?: string | null
          name: string
          notes?: string | null
          status: string
          training_corpus?: string | null
          updated_at?: string
          validation_metrics?: Json | null
          version: string
          weights_blob_path?: string | null
          weights_sha256?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deployed_at?: string | null
          deprecated_at?: string | null
          emits_schema_name?: string | null
          emits_schema_version?: string | null
          family?: string
          id?: string
          model_card_url?: string | null
          name?: string
          notes?: string | null
          status?: string
          training_corpus?: string | null
          updated_at?: string
          validation_metrics?: Json | null
          version?: string
          weights_blob_path?: string | null
          weights_sha256?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "model_versions_emits_schema_name_emits_schema_version_fkey"
            columns: ["emits_schema_name", "emits_schema_version"]
            isOneToOne: false
            referencedRelation: "schema_definitions"
            referencedColumns: ["name", "version"]
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
      pilot_subscription_charges: {
        Row: {
          created_at: string
          razorpay_payment_id: string
          razorpay_subscription_id: string
          tokens_credited: number
          user_id: string
        }
        Insert: {
          created_at?: string
          razorpay_payment_id: string
          razorpay_subscription_id: string
          tokens_credited?: number
          user_id: string
        }
        Update: {
          created_at?: string
          razorpay_payment_id?: string
          razorpay_subscription_id?: string
          tokens_credited?: number
          user_id?: string
        }
        Relationships: []
      }
      pilot_subscriptions: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          razorpay_plan_id: string | null
          razorpay_subscription_id: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          razorpay_plan_id?: string | null
          razorpay_subscription_id?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          razorpay_plan_id?: string | null
          razorpay_subscription_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
      report_drafts: {
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
            foreignKeyName: "report_drafts_study_id_fkey"
            columns: ["study_id"]
            isOneToOne: false
            referencedRelation: "studies"
            referencedColumns: ["id"]
          },
        ]
      }
      report_emission_events: {
        Row: {
          emitted_at: string
          emitted_by: string
          id: string
          model_version_id: string | null
          payload_preview: Json | null
          payload_sha256: string
          request_id: string | null
          schema_name: string
          schema_version: string
          study_id: string
          superseded_by: string | null
        }
        Insert: {
          emitted_at?: string
          emitted_by: string
          id?: string
          model_version_id?: string | null
          payload_preview?: Json | null
          payload_sha256: string
          request_id?: string | null
          schema_name: string
          schema_version: string
          study_id: string
          superseded_by?: string | null
        }
        Update: {
          emitted_at?: string
          emitted_by?: string
          id?: string
          model_version_id?: string | null
          payload_preview?: Json | null
          payload_sha256?: string
          request_id?: string | null
          schema_name?: string
          schema_version?: string
          study_id?: string
          superseded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "report_emission_events_model_version_id_fkey"
            columns: ["model_version_id"]
            isOneToOne: false
            referencedRelation: "model_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_emission_events_schema_name_schema_version_fkey"
            columns: ["schema_name", "schema_version"]
            isOneToOne: false
            referencedRelation: "schema_definitions"
            referencedColumns: ["name", "version"]
          },
          {
            foreignKeyName: "report_emission_events_study_id_fkey"
            columns: ["study_id"]
            isOneToOne: false
            referencedRelation: "studies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_emission_events_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "report_emission_events"
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
      reprocess_jobs: {
        Row: {
          created_at: string
          description: string | null
          error_summary: string | null
          finished_at: string | null
          id: string
          initiated_by: string | null
          request_id: string | null
          started_at: string | null
          status: string
          studies_failed: number
          studies_processed: number
          studies_total: number | null
          target_filter: Json
          target_model_version_id: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          error_summary?: string | null
          finished_at?: string | null
          id?: string
          initiated_by?: string | null
          request_id?: string | null
          started_at?: string | null
          status: string
          studies_failed?: number
          studies_processed?: number
          studies_total?: number | null
          target_filter: Json
          target_model_version_id?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          error_summary?: string | null
          finished_at?: string | null
          id?: string
          initiated_by?: string | null
          request_id?: string | null
          started_at?: string | null
          status?: string
          studies_failed?: number
          studies_processed?: number
          studies_total?: number | null
          target_filter?: Json
          target_model_version_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reprocess_jobs_target_model_version_id_fkey"
            columns: ["target_model_version_id"]
            isOneToOne: false
            referencedRelation: "model_versions"
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
      schema_definitions: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          name: string
          schema: Json
          schema_sha256: string
          version: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          name: string
          schema: Json
          schema_sha256: string
          version: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          name?: string
          schema?: Json
          schema_sha256?: string
          version?: string
        }
        Relationships: []
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
          source_content_sha256: string | null
          srate_hz: number | null
          state: string | null
          storage_backend: string | null
          storage_ref: string | null
          study_key: string | null
          tokens_deducted: number | null
          triage_completed_at: string | null
          triage_draft_json: Json | null
          triage_draft_text: string | null
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
          source_content_sha256?: string | null
          srate_hz?: number | null
          state?: string | null
          storage_backend?: string | null
          storage_ref?: string | null
          study_key?: string | null
          tokens_deducted?: number | null
          triage_completed_at?: string | null
          triage_draft_json?: Json | null
          triage_draft_text?: string | null
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
          source_content_sha256?: string | null
          srate_hz?: number | null
          state?: string | null
          storage_backend?: string | null
          storage_ref?: string | null
          study_key?: string | null
          tokens_deducted?: number | null
          triage_completed_at?: string | null
          triage_draft_json?: Json | null
          triage_draft_text?: string | null
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
            referencedRelation: "clinic_activation_status"
            referencedColumns: ["clinic_id"]
          },
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
      study_pipeline_events: {
        Row: {
          correlation_id: string | null
          created_at: string
          detail: Json
          id: string
          source: string
          status: string
          step: string
          study_id: string
        }
        Insert: {
          correlation_id?: string | null
          created_at?: string
          detail?: Json
          id?: string
          source: string
          status: string
          step: string
          study_id: string
        }
        Update: {
          correlation_id?: string | null
          created_at?: string
          detail?: Json
          id?: string
          source?: string
          status?: string
          step?: string
          study_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "study_pipeline_events_study_id_fkey"
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
            referencedRelation: "clinic_activation_status"
            referencedColumns: ["clinic_id"]
          },
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
      clinic_activation_status: {
        Row: {
          activation_complete: boolean | null
          active_doc_count: number | null
          clinic_id: string | null
          clinic_name: string | null
          consent_template_active: boolean | null
          dpa_active: boolean | null
          is_active: boolean | null
          loi_active: boolean | null
          mou_active: boolean | null
          msa_active: boolean | null
          sku: string | null
          total_doc_count: number | null
        }
        Relationships: []
      }
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
            referencedRelation: "clinic_activation_status"
            referencedColumns: ["clinic_id"]
          },
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
      signed_reports_without_pdf: {
        Row: {
          clinic_id: string | null
          clinic_name: string | null
          clinic_sku: string | null
          interpreter: string | null
          report_created_at: string | null
          report_id: string | null
          seconds_since_sign: number | null
          signed_at: string | null
          study_id: string | null
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
          {
            foreignKeyName: "studies_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinic_activation_status"
            referencedColumns: ["clinic_id"]
          },
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
          sku: string | null
          user_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      _user_is_admin_role: { Args: { p_user_id: string }; Returns: boolean }
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
          sku: string
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
          source_content_sha256: string | null
          srate_hz: number | null
          state: string | null
          storage_backend: string | null
          storage_ref: string | null
          study_key: string | null
          tokens_deducted: number | null
          triage_completed_at: string | null
          triage_draft_json: Json | null
          triage_draft_text: string | null
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
      admin_provision_clinic_resources: {
        Args: {
          p_actor_id: string
          p_city: string
          p_clinic_name: string
          p_clinician_email: string
          p_clinician_name: string
          p_initial_tokens: number
          p_new_user_id: string
          p_request_id: string
          p_sku: string
        }
        Returns: Json
      }
      admin_provision_clinician_for_clinic: {
        Args: {
          p_actor_id: string
          p_clinic_id: string
          p_clinician_email: string
          p_clinician_name: string
          p_initial_tokens: number
          p_new_user_id: string
          p_request_id: string
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
      admin_test_all_clinic_isolation: { Args: never; Returns: Json }
      admin_test_clinic_isolation: {
        Args: { p_clinic_b: string; p_clinician_a: string }
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
      check_tfa_status: { Args: never; Returns: Json }
      consume_credit_and_sign:
        | {
            Args: {
              p_content: Json
              p_cost: number
              p_study_id: string
              p_user_id: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_content: Json
              p_cost: number
              p_request_id?: string
              p_study_id: string
              p_user_id: string
            }
            Returns: Json
          }
      credit_wallet: {
        Args: { p_reason?: string; p_tokens: number; p_user_id: string }
        Returns: number
      }
      debit_wallet: {
        Args: { p_reason: string; p_tokens: number; p_user_id: string }
        Returns: number
      }
      enforce_channel_gate: {
        Args: { p_payload: Json; p_study_id: string }
        Returns: Json
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
      json_matches_schema: {
        Args: { instance: Json; schema: Json }
        Returns: boolean
      }
      jsonb_matches_schema: {
        Args: { instance: Json; schema: Json }
        Returns: boolean
      }
      jsonschema_is_valid: { Args: { schema: Json }; Returns: boolean }
      jsonschema_validation_errors: {
        Args: { instance: Json; schema: Json }
        Returns: string[]
      }
      recompute_v2_summary: { Args: { p_payload: Json }; Returns: Json }
      request_token_refund: {
        Args: { p_reason?: string; p_study_id: string }
        Returns: Json
      }
      select_sla_and_start_triage: {
        Args: { p_sla: string; p_study_id: string }
        Returns: Json
      }
    }
    Enums: {
      app_role: "super_admin" | "management" | "clinician"
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
      app_role: ["super_admin", "management", "clinician"],
    },
  },
} as const
