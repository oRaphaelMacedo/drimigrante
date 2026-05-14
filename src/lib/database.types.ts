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
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      ai_configurations: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          max_tokens: number | null
          model: string
          provider: Database["public"]["Enums"]["ai_provider"]
          system_prompt: string | null
          temperature: number | null
          updated_at: string | null
          updated_by: string | null
          use_case: Database["public"]["Enums"]["ai_use_case"]
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          max_tokens?: number | null
          model: string
          provider: Database["public"]["Enums"]["ai_provider"]
          system_prompt?: string | null
          temperature?: number | null
          updated_at?: string | null
          updated_by?: string | null
          use_case: Database["public"]["Enums"]["ai_use_case"]
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          max_tokens?: number | null
          model?: string
          provider?: Database["public"]["Enums"]["ai_provider"]
          system_prompt?: string | null
          temperature?: number | null
          updated_at?: string | null
          updated_by?: string | null
          use_case?: Database["public"]["Enums"]["ai_use_case"]
        }
        Relationships: []
      }
      assessment_results: {
        Row: {
          assessment_id: string
          computed_at: string | null
          created_at: string | null
          ia_explanation_full: string | null
          ia_explanation_short: string | null
          ia_model_used: string | null
          ia_tokens_used: number | null
          id: string
          needs_reprocessing: boolean | null
          reprocessing_reason: string | null
          rule_version_id: string | null
          score_category: string | null
          score_numeric: number | null
          suggested_visa_types: Json | null
        }
        Insert: {
          assessment_id: string
          computed_at?: string | null
          created_at?: string | null
          ia_explanation_full?: string | null
          ia_explanation_short?: string | null
          ia_model_used?: string | null
          ia_tokens_used?: number | null
          id?: string
          needs_reprocessing?: boolean | null
          reprocessing_reason?: string | null
          rule_version_id?: string | null
          score_category?: string | null
          score_numeric?: number | null
          suggested_visa_types?: Json | null
        }
        Update: {
          assessment_id?: string
          computed_at?: string | null
          created_at?: string | null
          ia_explanation_full?: string | null
          ia_explanation_short?: string | null
          ia_model_used?: string | null
          ia_tokens_used?: number | null
          id?: string
          needs_reprocessing?: boolean | null
          reprocessing_reason?: string | null
          rule_version_id?: string | null
          score_category?: string | null
          score_numeric?: number | null
          suggested_visa_types?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "assessment_results_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: true
            referencedRelation: "assessments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_results_rule_version_id_fkey"
            columns: ["rule_version_id"]
            isOneToOne: false
            referencedRelation: "rule_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      assessments: {
        Row: {
          answers: Json | null
          completed_at: string | null
          completion_percentage: number | null
          country_origin_id: string | null
          created_at: string | null
          crm_stage: string
          current_question_id: string | null
          email: string | null
          expires_at: string | null
          first_page: string | null
          form_version_id: string | null
          full_name: string | null
          id: string
          ip_address: unknown
          phone: string | null
          questions_answered: number | null
          referrer: string | null
          session_id: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["assessment_status"] | null
          total_questions: number | null
          updated_at: string | null
          user_agent: string | null
          user_id: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
        }
        Insert: {
          answers?: Json | null
          completed_at?: string | null
          completion_percentage?: number | null
          country_origin_id?: string | null
          created_at?: string | null
          crm_stage?: string
          current_question_id?: string | null
          email?: string | null
          expires_at?: string | null
          first_page?: string | null
          form_version_id?: string | null
          full_name?: string | null
          id?: string
          ip_address?: unknown
          phone?: string | null
          questions_answered?: number | null
          referrer?: string | null
          session_id?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["assessment_status"] | null
          total_questions?: number | null
          updated_at?: string | null
          user_agent?: string | null
          user_id?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Update: {
          answers?: Json | null
          completed_at?: string | null
          completion_percentage?: number | null
          country_origin_id?: string | null
          created_at?: string | null
          crm_stage?: string
          current_question_id?: string | null
          email?: string | null
          expires_at?: string | null
          first_page?: string | null
          form_version_id?: string | null
          full_name?: string | null
          id?: string
          ip_address?: unknown
          phone?: string | null
          questions_answered?: number | null
          referrer?: string | null
          session_id?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["assessment_status"] | null
          total_questions?: number | null
          updated_at?: string | null
          user_agent?: string | null
          user_id?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assessments_country_origin_id_fkey"
            columns: ["country_origin_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessments_current_question_id_fkey"
            columns: ["current_question_id"]
            isOneToOne: false
            referencedRelation: "form_questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessments_form_version_id_fkey"
            columns: ["form_version_id"]
            isOneToOne: false
            referencedRelation: "form_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_type: string | null
          actor_user_id: string | null
          changed_fields: string[] | null
          created_at: string | null
          id: string
          ip_address: unknown
          new_values: Json | null
          old_values: Json | null
          record_id: string | null
          table_name: string
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_type?: string | null
          actor_user_id?: string | null
          changed_fields?: string[] | null
          created_at?: string | null
          id?: string
          ip_address?: unknown
          new_values?: Json | null
          old_values?: Json | null
          record_id?: string | null
          table_name: string
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_type?: string | null
          actor_user_id?: string | null
          changed_fields?: string[] | null
          created_at?: string | null
          id?: string
          ip_address?: unknown
          new_values?: Json | null
          old_values?: Json | null
          record_id?: string | null
          table_name?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      case_applicants: {
        Row: {
          case_id: string
          created_at: string | null
          date_of_birth: string | null
          full_name: string
          id: string
          is_primary: boolean | null
          metadata: Json | null
          nationality_id: string | null
          passport_expiry: string | null
          passport_number: string | null
          relationship: string | null
          updated_at: string | null
        }
        Insert: {
          case_id: string
          created_at?: string | null
          date_of_birth?: string | null
          full_name: string
          id?: string
          is_primary?: boolean | null
          metadata?: Json | null
          nationality_id?: string | null
          passport_expiry?: string | null
          passport_number?: string | null
          relationship?: string | null
          updated_at?: string | null
        }
        Update: {
          case_id?: string
          created_at?: string | null
          date_of_birth?: string | null
          full_name?: string
          id?: string
          is_primary?: boolean | null
          metadata?: Json | null
          nationality_id?: string | null
          passport_expiry?: string | null
          passport_number?: string | null
          relationship?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "case_applicants_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_applicants_nationality_id_fkey"
            columns: ["nationality_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
        ]
      }
      case_documents: {
        Row: {
          applicant_id: string | null
          case_id: string
          created_at: string | null
          document_name: string
          document_type_code: string
          expiration_date: string | null
          extracted_data: Json | null
          file_size_bytes: number | null
          id: string
          mime_type: string | null
          status: Database["public"]["Enums"]["document_status"] | null
          storage_path: string | null
          updated_at: string | null
          uploaded_at: string | null
          validated_at: string | null
          validated_by: string | null
          validation_notes: string | null
        }
        Insert: {
          applicant_id?: string | null
          case_id: string
          created_at?: string | null
          document_name: string
          document_type_code: string
          expiration_date?: string | null
          extracted_data?: Json | null
          file_size_bytes?: number | null
          id?: string
          mime_type?: string | null
          status?: Database["public"]["Enums"]["document_status"] | null
          storage_path?: string | null
          updated_at?: string | null
          uploaded_at?: string | null
          validated_at?: string | null
          validated_by?: string | null
          validation_notes?: string | null
        }
        Update: {
          applicant_id?: string | null
          case_id?: string
          created_at?: string | null
          document_name?: string
          document_type_code?: string
          expiration_date?: string | null
          extracted_data?: Json | null
          file_size_bytes?: number | null
          id?: string
          mime_type?: string | null
          status?: Database["public"]["Enums"]["document_status"] | null
          storage_path?: string | null
          updated_at?: string | null
          uploaded_at?: string | null
          validated_at?: string | null
          validated_by?: string | null
          validation_notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "case_documents_applicant_id_fkey"
            columns: ["applicant_id"]
            isOneToOne: false
            referencedRelation: "case_applicants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_documents_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      case_messages: {
        Row: {
          ai_cost_usd: number | null
          ai_model_used: string | null
          ai_tokens_used: number | null
          case_id: string
          content: string
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["message_role"]
          sender_user_id: string | null
        }
        Insert: {
          ai_cost_usd?: number | null
          ai_model_used?: string | null
          ai_tokens_used?: number | null
          case_id: string
          content: string
          created_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["message_role"]
          sender_user_id?: string | null
        }
        Update: {
          ai_cost_usd?: number | null
          ai_model_used?: string | null
          ai_tokens_used?: number | null
          case_id?: string
          content?: string
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["message_role"]
          sender_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "case_messages_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      case_tasks: {
        Row: {
          assigned_to: string | null
          case_id: string | null
          completed_at: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          due_date: string | null
          id: string
          lead_id: string | null
          metadata: Json | null
          priority: Database["public"]["Enums"]["task_priority"] | null
          status: Database["public"]["Enums"]["task_status"] | null
          title: string
          type: Database["public"]["Enums"]["task_type"]
          updated_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          case_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          lead_id?: string | null
          metadata?: Json | null
          priority?: Database["public"]["Enums"]["task_priority"] | null
          status?: Database["public"]["Enums"]["task_status"] | null
          title: string
          type: Database["public"]["Enums"]["task_type"]
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          case_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          lead_id?: string | null
          metadata?: Json | null
          priority?: Database["public"]["Enums"]["task_priority"] | null
          status?: Database["public"]["Enums"]["task_status"] | null
          title?: string
          type?: Database["public"]["Enums"]["task_type"]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "case_tasks_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_tasks_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "crm_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      cases: {
        Row: {
          amount_paid: number | null
          closed_at: string | null
          contract_value: number | null
          created_at: string | null
          expected_completion_date: string | null
          id: string
          lead_id: string | null
          metadata: Json | null
          opened_at: string | null
          primary_user_id: string
          responsible_lawyer_id: string | null
          status: Database["public"]["Enums"]["case_status"] | null
          tenant_id: string
          updated_at: string | null
          visa_type_id: string
        }
        Insert: {
          amount_paid?: number | null
          closed_at?: string | null
          contract_value?: number | null
          created_at?: string | null
          expected_completion_date?: string | null
          id?: string
          lead_id?: string | null
          metadata?: Json | null
          opened_at?: string | null
          primary_user_id: string
          responsible_lawyer_id?: string | null
          status?: Database["public"]["Enums"]["case_status"] | null
          tenant_id: string
          updated_at?: string | null
          visa_type_id: string
        }
        Update: {
          amount_paid?: number | null
          closed_at?: string | null
          contract_value?: number | null
          created_at?: string | null
          expected_completion_date?: string | null
          id?: string
          lead_id?: string | null
          metadata?: Json | null
          opened_at?: string | null
          primary_user_id?: string
          responsible_lawyer_id?: string | null
          status?: Database["public"]["Enums"]["case_status"] | null
          tenant_id?: string
          updated_at?: string | null
          visa_type_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cases_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "crm_leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_visa_type_id_fkey"
            columns: ["visa_type_id"]
            isOneToOne: false
            referencedRelation: "visa_types"
            referencedColumns: ["id"]
          },
        ]
      }
      countries: {
        Row: {
          code: string
          created_at: string | null
          flag_emoji: string | null
          id: string
          is_origin: boolean | null
          is_supported: boolean | null
          is_target: boolean | null
          name_en: string
          name_pt: string
          sort_order: number | null
        }
        Insert: {
          code: string
          created_at?: string | null
          flag_emoji?: string | null
          id?: string
          is_origin?: boolean | null
          is_supported?: boolean | null
          is_target?: boolean | null
          name_en: string
          name_pt: string
          sort_order?: number | null
        }
        Update: {
          code?: string
          created_at?: string | null
          flag_emoji?: string | null
          id?: string
          is_origin?: boolean | null
          is_supported?: boolean | null
          is_target?: boolean | null
          name_en?: string
          name_pt?: string
          sort_order?: number | null
        }
        Relationships: []
      }
      crm_activity_log: {
        Row: {
          action: string
          actor_type: string | null
          actor_user_id: string | null
          created_at: string | null
          details: Json | null
          id: string
          lead_id: string
        }
        Insert: {
          action: string
          actor_type?: string | null
          actor_user_id?: string | null
          created_at?: string | null
          details?: Json | null
          id?: string
          lead_id: string
        }
        Update: {
          action?: string
          actor_type?: string | null
          actor_user_id?: string | null
          created_at?: string | null
          details?: Json | null
          id?: string
          lead_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_activity_log_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "crm_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_leads: {
        Row: {
          assessment_id: string | null
          assigned_tenant_id: string
          assigned_user_id: string | null
          country_origin_id: string | null
          created_at: string | null
          deal_value_estimated: number | null
          email: string | null
          first_contacted_at: string | null
          full_name: string
          id: string
          last_contacted_at: string | null
          lost_reason: string | null
          next_followup_at: string | null
          notes: string | null
          phone: string | null
          score: number | null
          source: string | null
          source_tenant_id: string
          status: Database["public"]["Enums"]["lead_status"] | null
          suggested_visa_type_id: string | null
          temperature: Database["public"]["Enums"]["lead_temperature"] | null
          updated_at: string | null
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
        }
        Insert: {
          assessment_id?: string | null
          assigned_tenant_id: string
          assigned_user_id?: string | null
          country_origin_id?: string | null
          created_at?: string | null
          deal_value_estimated?: number | null
          email?: string | null
          first_contacted_at?: string | null
          full_name: string
          id?: string
          last_contacted_at?: string | null
          lost_reason?: string | null
          next_followup_at?: string | null
          notes?: string | null
          phone?: string | null
          score?: number | null
          source?: string | null
          source_tenant_id: string
          status?: Database["public"]["Enums"]["lead_status"] | null
          suggested_visa_type_id?: string | null
          temperature?: Database["public"]["Enums"]["lead_temperature"] | null
          updated_at?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Update: {
          assessment_id?: string | null
          assigned_tenant_id?: string
          assigned_user_id?: string | null
          country_origin_id?: string | null
          created_at?: string | null
          deal_value_estimated?: number | null
          email?: string | null
          first_contacted_at?: string | null
          full_name?: string
          id?: string
          last_contacted_at?: string | null
          lost_reason?: string | null
          next_followup_at?: string | null
          notes?: string | null
          phone?: string | null
          score?: number | null
          source?: string | null
          source_tenant_id?: string
          status?: Database["public"]["Enums"]["lead_status"] | null
          suggested_visa_type_id?: string | null
          temperature?: Database["public"]["Enums"]["lead_temperature"] | null
          updated_at?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_leads_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "assessments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_leads_assigned_tenant_id_fkey"
            columns: ["assigned_tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_leads_country_origin_id_fkey"
            columns: ["country_origin_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_leads_source_tenant_id_fkey"
            columns: ["source_tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_leads_suggested_visa_type_id_fkey"
            columns: ["suggested_visa_type_id"]
            isOneToOne: false
            referencedRelation: "visa_types"
            referencedColumns: ["id"]
          },
        ]
      }
      eligibility_rules: {
        Row: {
          created_at: string | null
          criterion_key: string
          criterion_name_pt: string
          description: string | null
          id: string
          is_mandatory: boolean | null
          rule_logic: Json
          rule_version_id: string
          sort_order: number | null
          visa_type_id: string
          weight: number | null
        }
        Insert: {
          created_at?: string | null
          criterion_key: string
          criterion_name_pt: string
          description?: string | null
          id?: string
          is_mandatory?: boolean | null
          rule_logic: Json
          rule_version_id: string
          sort_order?: number | null
          visa_type_id: string
          weight?: number | null
        }
        Update: {
          created_at?: string | null
          criterion_key?: string
          criterion_name_pt?: string
          description?: string | null
          id?: string
          is_mandatory?: boolean | null
          rule_logic?: Json
          rule_version_id?: string
          sort_order?: number | null
          visa_type_id?: string
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "eligibility_rules_rule_version_id_fkey"
            columns: ["rule_version_id"]
            isOneToOne: false
            referencedRelation: "rule_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eligibility_rules_visa_type_id_fkey"
            columns: ["visa_type_id"]
            isOneToOne: false
            referencedRelation: "visa_types"
            referencedColumns: ["id"]
          },
        ]
      }
      email_send_log: {
        Row: {
          body_html: string | null
          created_at: string | null
          error_message: string | null
          id: string
          provider: string | null
          provider_message_id: string | null
          recipient_email: string
          sent_at: string | null
          status: string | null
          subject: string | null
          template_id: string | null
          user_id: string | null
          variables_used: Json | null
        }
        Insert: {
          body_html?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          provider?: string | null
          provider_message_id?: string | null
          recipient_email: string
          sent_at?: string | null
          status?: string | null
          subject?: string | null
          template_id?: string | null
          user_id?: string | null
          variables_used?: Json | null
        }
        Update: {
          body_html?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          provider?: string | null
          provider_message_id?: string | null
          recipient_email?: string
          sent_at?: string | null
          status?: string | null
          subject?: string | null
          template_id?: string | null
          user_id?: string | null
          variables_used?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "email_send_log_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "email_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      email_templates: {
        Row: {
          body_html_en: string | null
          body_html_pt: string
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          subject_en: string | null
          subject_pt: string
          trigger_key: string
          updated_at: string | null
          variables: Json | null
        }
        Insert: {
          body_html_en?: string | null
          body_html_pt: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          subject_en?: string | null
          subject_pt: string
          trigger_key: string
          updated_at?: string | null
          variables?: Json | null
        }
        Update: {
          body_html_en?: string | null
          body_html_pt?: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          subject_en?: string | null
          subject_pt?: string
          trigger_key?: string
          updated_at?: string | null
          variables?: Json | null
        }
        Relationships: []
      }
      form_question_options: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          is_eliminatory: boolean | null
          next_question_id: string | null
          option_key: string
          option_text_en: string | null
          option_text_pt: string
          pendency_text: string | null
          question_id: string
          score: number | null
          skip_to_question_id: string | null
          sort_order: number | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          is_eliminatory?: boolean | null
          next_question_id?: string | null
          option_key: string
          option_text_en?: string | null
          option_text_pt: string
          pendency_text?: string | null
          question_id: string
          score?: number | null
          skip_to_question_id?: string | null
          sort_order?: number | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          is_eliminatory?: boolean | null
          next_question_id?: string | null
          option_key?: string
          option_text_en?: string | null
          option_text_pt?: string
          pendency_text?: string | null
          question_id?: string
          score?: number | null
          skip_to_question_id?: string | null
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "form_question_options_next_question_id_fkey"
            columns: ["next_question_id"]
            isOneToOne: false
            referencedRelation: "form_questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_question_options_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "form_questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_question_options_skip_to_question_id_fkey"
            columns: ["skip_to_question_id"]
            isOneToOne: false
            referencedRelation: "form_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      form_questions: {
        Row: {
          created_at: string | null
          display_conditions: Json | null
          field_type: Database["public"]["Enums"]["field_type"]
          help_text: string | null
          id: string
          is_active: boolean | null
          is_required: boolean | null
          max_length: number | null
          max_value: number | null
          min_value: number | null
          placeholder: string | null
          question_key: string
          question_text_en: string | null
          question_text_pt: string
          sort_order: number | null
          theme_id: string
          updated_at: string | null
          validation_rules: Json | null
        }
        Insert: {
          created_at?: string | null
          display_conditions?: Json | null
          field_type: Database["public"]["Enums"]["field_type"]
          help_text?: string | null
          id?: string
          is_active?: boolean | null
          is_required?: boolean | null
          max_length?: number | null
          max_value?: number | null
          min_value?: number | null
          placeholder?: string | null
          question_key: string
          question_text_en?: string | null
          question_text_pt: string
          sort_order?: number | null
          theme_id: string
          updated_at?: string | null
          validation_rules?: Json | null
        }
        Update: {
          created_at?: string | null
          display_conditions?: Json | null
          field_type?: Database["public"]["Enums"]["field_type"]
          help_text?: string | null
          id?: string
          is_active?: boolean | null
          is_required?: boolean | null
          max_length?: number | null
          max_value?: number | null
          min_value?: number | null
          placeholder?: string | null
          question_key?: string
          question_text_en?: string | null
          question_text_pt?: string
          sort_order?: number | null
          theme_id?: string
          updated_at?: string | null
          validation_rules?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "form_questions_theme_id_fkey"
            columns: ["theme_id"]
            isOneToOne: false
            referencedRelation: "form_themes"
            referencedColumns: ["id"]
          },
        ]
      }
      form_themes: {
        Row: {
          code: string
          color: string | null
          created_at: string | null
          description: string | null
          icon: string | null
          id: string
          is_active: boolean | null
          name_en: string | null
          name_pt: string
          sort_order: number | null
          updated_at: string | null
        }
        Insert: {
          code: string
          color?: string | null
          created_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name_en?: string | null
          name_pt: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Update: {
          code?: string
          color?: string | null
          created_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name_en?: string | null
          name_pt?: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      form_versions: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          name: string | null
          published_at: string | null
          published_by: string | null
          schema_snapshot: Json | null
          version_number: number
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string | null
          published_at?: string | null
          published_by?: string | null
          schema_snapshot?: Json | null
          version_number: number
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string | null
          published_at?: string | null
          published_by?: string | null
          schema_snapshot?: Json | null
          version_number?: number
        }
        Relationships: []
      }
      messages: {
        Row: {
          assessment_id: string
          content: string
          created_at: string | null
          id: string
          role: string
          user_id: string
        }
        Insert: {
          assessment_id: string
          content: string
          created_at?: string | null
          id?: string
          role: string
          user_id: string
        }
        Update: {
          assessment_id?: string
          content?: string
          created_at?: string | null
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "assessments"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_events: {
        Row: {
          amount: number | null
          created_at: string | null
          currency: string | null
          id: string
          payload: Json | null
          processed_at: string | null
          status: string | null
          stripe_event_id: string | null
          stripe_event_type: string | null
          stripe_object_id: string | null
          subscription_id: string | null
          user_id: string | null
        }
        Insert: {
          amount?: number | null
          created_at?: string | null
          currency?: string | null
          id?: string
          payload?: Json | null
          processed_at?: string | null
          status?: string | null
          stripe_event_id?: string | null
          stripe_event_type?: string | null
          stripe_object_id?: string | null
          subscription_id?: string | null
          user_id?: string | null
        }
        Update: {
          amount?: number | null
          created_at?: string | null
          currency?: string | null
          id?: string
          payload?: Json | null
          processed_at?: string | null
          status?: string | null
          stripe_event_id?: string | null
          stripe_event_type?: string | null
          stripe_object_id?: string | null
          subscription_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_events_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount_cents: number
          assessment_id: string | null
          created_at: string
          currency: string
          id: string
          metadata: Json
          paid_at: string | null
          product: Database["public"]["Enums"]["payment_product"]
          refunded_at: string | null
          status: Database["public"]["Enums"]["payment_status"]
          stripe_customer_id: string | null
          stripe_payment_intent_id: string | null
          stripe_subscription_id: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          amount_cents: number
          assessment_id?: string | null
          created_at?: string
          currency?: string
          id?: string
          metadata?: Json
          paid_at?: string | null
          product: Database["public"]["Enums"]["payment_product"]
          refunded_at?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          stripe_customer_id?: string | null
          stripe_payment_intent_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          amount_cents?: number
          assessment_id?: string | null
          created_at?: string
          currency?: string
          id?: string
          metadata?: Json
          paid_at?: string | null
          product?: Database["public"]["Enums"]["payment_product"]
          refunded_at?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          stripe_customer_id?: string | null
          stripe_payment_intent_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "assessments"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          email: string
          full_name: string
          id: string
          is_active: boolean | null
          language: string | null
          last_login_at: string | null
          notification_preferences: Json | null
          phone: string | null
          tenant_id: string
          timezone: string | null
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          email: string
          full_name: string
          id: string
          is_active?: boolean | null
          language?: string | null
          last_login_at?: string | null
          notification_preferences?: Json | null
          phone?: string | null
          tenant_id: string
          timezone?: string | null
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string
          full_name?: string
          id?: string
          is_active?: boolean | null
          language?: string | null
          last_login_at?: string | null
          notification_preferences?: Json | null
          phone?: string | null
          tenant_id?: string
          timezone?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      rule_versions: {
        Row: {
          created_at: string | null
          effective_date: string | null
          id: string
          is_active: boolean | null
          legal_references: Json | null
          notes: string | null
          published_at: string | null
          published_by: string | null
          rules: Json
          version_number: number
          visa_type_id: string | null
        }
        Insert: {
          created_at?: string | null
          effective_date?: string | null
          id?: string
          is_active?: boolean | null
          legal_references?: Json | null
          notes?: string | null
          published_at?: string | null
          published_by?: string | null
          rules: Json
          version_number: number
          visa_type_id?: string | null
        }
        Update: {
          created_at?: string | null
          effective_date?: string | null
          id?: string
          is_active?: boolean | null
          legal_references?: Json | null
          notes?: string | null
          published_at?: string | null
          published_by?: string | null
          rules?: Json
          version_number?: number
          visa_type_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rule_versions_visa_type_id_fkey"
            columns: ["visa_type_id"]
            isOneToOne: false
            referencedRelation: "visa_types"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          created_at: string | null
          has_chat_access: boolean | null
          has_dashboard_access: boolean | null
          has_full_analysis: boolean | null
          id: string
          one_time_paid: boolean | null
          one_time_paid_at: string | null
          one_time_payment_amount: number | null
          recurring_active: boolean | null
          recurring_amount: number | null
          recurring_cancelled_at: string | null
          recurring_started_at: string | null
          stripe_customer_id: string | null
          stripe_payment_intent_id: string | null
          stripe_subscription_id: string | null
          tier: Database["public"]["Enums"]["subscription_tier"] | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          has_chat_access?: boolean | null
          has_dashboard_access?: boolean | null
          has_full_analysis?: boolean | null
          id?: string
          one_time_paid?: boolean | null
          one_time_paid_at?: string | null
          one_time_payment_amount?: number | null
          recurring_active?: boolean | null
          recurring_amount?: number | null
          recurring_cancelled_at?: string | null
          recurring_started_at?: string | null
          stripe_customer_id?: string | null
          stripe_payment_intent_id?: string | null
          stripe_subscription_id?: string | null
          tier?: Database["public"]["Enums"]["subscription_tier"] | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          has_chat_access?: boolean | null
          has_dashboard_access?: boolean | null
          has_full_analysis?: boolean | null
          id?: string
          one_time_paid?: boolean | null
          one_time_paid_at?: string | null
          one_time_payment_amount?: number | null
          recurring_active?: boolean | null
          recurring_amount?: number | null
          recurring_cancelled_at?: string | null
          recurring_started_at?: string | null
          stripe_customer_id?: string | null
          stripe_payment_intent_id?: string | null
          stripe_subscription_id?: string | null
          tier?: Database["public"]["Enums"]["subscription_tier"] | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      tenants: {
        Row: {
          address: string | null
          billing_info: Json | null
          city: string | null
          country_code: string | null
          created_at: string | null
          created_by: string | null
          email: string | null
          id: string
          metadata: Json | null
          name: string
          phone: string | null
          slug: string
          status: Database["public"]["Enums"]["tenant_status"]
          stripe_customer_id: string | null
          type: Database["public"]["Enums"]["tenant_type"]
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          billing_info?: Json | null
          city?: string | null
          country_code?: string | null
          created_at?: string | null
          created_by?: string | null
          email?: string | null
          id?: string
          metadata?: Json | null
          name: string
          phone?: string | null
          slug: string
          status?: Database["public"]["Enums"]["tenant_status"]
          stripe_customer_id?: string | null
          type?: Database["public"]["Enums"]["tenant_type"]
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          billing_info?: Json | null
          city?: string | null
          country_code?: string | null
          created_at?: string | null
          created_by?: string | null
          email?: string | null
          id?: string
          metadata?: Json | null
          name?: string
          phone?: string | null
          slug?: string
          status?: Database["public"]["Enums"]["tenant_status"]
          stripe_customer_id?: string | null
          type?: Database["public"]["Enums"]["tenant_type"]
          updated_at?: string | null
        }
        Relationships: []
      }
      user_documents: {
        Row: {
          assessment_id: string | null
          created_at: string
          display_name: string
          document_type: string
          feedback: string | null
          file_name: string
          file_size: number | null
          id: string
          mime_type: string | null
          status: string
          storage_path: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          assessment_id?: string | null
          created_at?: string
          display_name: string
          document_type: string
          feedback?: string | null
          file_name: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          status?: string
          storage_path: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          assessment_id?: string | null
          created_at?: string
          display_name?: string
          document_type?: string
          feedback?: string | null
          file_name?: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          status?: string
          storage_path?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_documents_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "assessments"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          expires_at: string | null
          granted_at: string | null
          granted_by: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          tenant_id: string
          user_id: string
        }
        Insert: {
          expires_at?: string | null
          granted_at?: string | null
          granted_by?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          tenant_id: string
          user_id: string
        }
        Update: {
          expires_at?: string | null
          granted_at?: string | null
          granted_by?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      visa_categories: {
        Row: {
          code: string
          country_id: string
          created_at: string | null
          description: string | null
          icon: string | null
          id: string
          is_active: boolean | null
          name_en: string | null
          name_pt: string
          sort_order: number | null
        }
        Insert: {
          code: string
          country_id: string
          created_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name_en?: string | null
          name_pt: string
          sort_order?: number | null
        }
        Update: {
          code?: string
          country_id?: string
          created_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name_en?: string | null
          name_pt?: string
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "visa_categories_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
        ]
      }
      visa_types: {
        Row: {
          category_id: string
          code: string
          created_at: string | null
          description: string | null
          eligibility_overview: string | null
          id: string
          is_active: boolean | null
          name_en: string | null
          name_pt: string
          required_documents: Json | null
          sort_order: number | null
          typical_cost_max: number | null
          typical_cost_min: number | null
          typical_duration_days: number | null
        }
        Insert: {
          category_id: string
          code: string
          created_at?: string | null
          description?: string | null
          eligibility_overview?: string | null
          id?: string
          is_active?: boolean | null
          name_en?: string | null
          name_pt: string
          required_documents?: Json | null
          sort_order?: number | null
          typical_cost_max?: number | null
          typical_cost_min?: number | null
          typical_duration_days?: number | null
        }
        Update: {
          category_id?: string
          code?: string
          created_at?: string | null
          description?: string | null
          eligibility_overview?: string | null
          id?: string
          is_active?: boolean | null
          name_en?: string | null
          name_pt?: string
          required_documents?: Json | null
          sort_order?: number | null
          typical_cost_max?: number | null
          typical_cost_min?: number | null
          typical_duration_days?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "visa_types_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "visa_categories"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_anon_assessment: {
        Args: { p_id: string; p_session_id: string }
        Returns: {
          answers: Json | null
          completed_at: string | null
          completion_percentage: number | null
          country_origin_id: string | null
          created_at: string | null
          crm_stage: string
          current_question_id: string | null
          email: string | null
          expires_at: string | null
          first_page: string | null
          form_version_id: string | null
          full_name: string | null
          id: string
          ip_address: unknown
          phone: string | null
          questions_answered: number | null
          referrer: string | null
          session_id: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["assessment_status"] | null
          total_questions: number | null
          updated_at: string | null
          user_agent: string | null
          user_id: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "assessments"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_user_tenant_id: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _tenant_id?: string
          _user_id: string
        }
        Returns: boolean
      }
      is_hub_admin: { Args: never; Returns: boolean }
      is_hub_user: { Args: { _user_id: string }; Returns: boolean }
      link_anon_assessment_to_user: {
        Args: { p_id: string; p_session_id: string }
        Returns: {
          answers: Json | null
          completed_at: string | null
          completion_percentage: number | null
          country_origin_id: string | null
          created_at: string | null
          crm_stage: string
          current_question_id: string | null
          email: string | null
          expires_at: string | null
          first_page: string | null
          form_version_id: string | null
          full_name: string | null
          id: string
          ip_address: unknown
          phone: string | null
          questions_answered: number | null
          referrer: string | null
          session_id: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["assessment_status"] | null
          total_questions: number | null
          updated_at: string | null
          user_agent: string | null
          user_id: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
        }
        SetofOptions: {
          from: "*"
          to: "assessments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      snapshot_quiz_version: { Args: { p_label?: string }; Returns: string }
      upsert_anon_assessment: {
        Args: {
          p_answers: Json
          p_completion_percentage?: number
          p_email?: string
          p_full_name?: string
          p_phone?: string
          p_questions_answered?: number
          p_session_id: string
          p_status?: string
          p_total_questions?: number
          p_utm_campaign?: string
          p_utm_medium?: string
          p_utm_source?: string
        }
        Returns: {
          answers: Json | null
          completed_at: string | null
          completion_percentage: number | null
          country_origin_id: string | null
          created_at: string | null
          crm_stage: string
          current_question_id: string | null
          email: string | null
          expires_at: string | null
          first_page: string | null
          form_version_id: string | null
          full_name: string | null
          id: string
          ip_address: unknown
          phone: string | null
          questions_answered: number | null
          referrer: string | null
          session_id: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["assessment_status"] | null
          total_questions: number | null
          updated_at: string | null
          user_agent: string | null
          user_id: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
        }
        SetofOptions: {
          from: "*"
          to: "assessments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      ai_provider: "openai" | "gemini" | "anthropic"
      ai_use_case: "scoring" | "analysis" | "chat" | "document_extraction"
      app_role:
        | "super_admin"
        | "hub_admin"
        | "office_admin"
        | "lawyer"
        | "paralegal"
        | "client"
      assessment_status: "incomplete" | "completed" | "expired"
      case_status:
        | "intake"
        | "eligibility"
        | "documentation"
        | "analysis"
        | "preparation"
        | "submission"
        | "follow_up"
        | "concluded"
        | "cancelled"
      document_status:
        | "pending"
        | "uploaded"
        | "verified"
        | "rejected"
        | "expired"
      field_type:
        | "text"
        | "textarea"
        | "radio"
        | "checkbox"
        | "select"
        | "autocomplete"
        | "date"
        | "number"
        | "email"
        | "phone"
        | "multiselect"
      lead_status:
        | "novo"
        | "qualificado"
        | "em_contacto"
        | "consulta_agendada"
        | "consulta_feita"
        | "proposta_enviada"
        | "fechado_ganho"
        | "fechado_perdido"
        | "nutricao"
      lead_temperature: "frio" | "morno" | "quente"
      message_role: "user" | "assistant" | "system"
      payment_product: "one_time_analysis" | "recurring_monthly"
      payment_status:
        | "pending"
        | "processing"
        | "succeeded"
        | "failed"
        | "refunded"
        | "disputed"
      subscription_tier: "free" | "one_time" | "recurring"
      task_priority: "low" | "medium" | "high" | "urgent"
      task_status: "open" | "in_progress" | "done" | "cancelled"
      task_type:
        | "whatsapp"
        | "email"
        | "call"
        | "document_review"
        | "internal"
        | "consultation"
      tenant_status: "active" | "suspended" | "pending"
      tenant_type: "hub" | "office"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      ai_provider: ["openai", "gemini", "anthropic"],
      ai_use_case: ["scoring", "analysis", "chat", "document_extraction"],
      app_role: [
        "super_admin",
        "hub_admin",
        "office_admin",
        "lawyer",
        "paralegal",
        "client",
      ],
      assessment_status: ["incomplete", "completed", "expired"],
      case_status: [
        "intake",
        "eligibility",
        "documentation",
        "analysis",
        "preparation",
        "submission",
        "follow_up",
        "concluded",
        "cancelled",
      ],
      document_status: [
        "pending",
        "uploaded",
        "verified",
        "rejected",
        "expired",
      ],
      field_type: [
        "text",
        "textarea",
        "radio",
        "checkbox",
        "select",
        "autocomplete",
        "date",
        "number",
        "email",
        "phone",
        "multiselect",
      ],
      lead_status: [
        "novo",
        "qualificado",
        "em_contacto",
        "consulta_agendada",
        "consulta_feita",
        "proposta_enviada",
        "fechado_ganho",
        "fechado_perdido",
        "nutricao",
      ],
      lead_temperature: ["frio", "morno", "quente"],
      message_role: ["user", "assistant", "system"],
      payment_product: ["one_time_analysis", "recurring_monthly"],
      payment_status: [
        "pending",
        "processing",
        "succeeded",
        "failed",
        "refunded",
        "disputed",
      ],
      subscription_tier: ["free", "one_time", "recurring"],
      task_priority: ["low", "medium", "high", "urgent"],
      task_status: ["open", "in_progress", "done", "cancelled"],
      task_type: [
        "whatsapp",
        "email",
        "call",
        "document_review",
        "internal",
        "consultation",
      ],
      tenant_status: ["active", "suspended", "pending"],
      tenant_type: ["hub", "office"],
    },
  },
} as const

// ─── Helper types — compatibility aliases ──────────────────────────────────────
export type Assessment    = Database['public']['Tables']['assessments']['Row']
export type Profile       = Database['public']['Tables']['profiles']['Row']
export type Subscription  = Database['public']['Tables']['subscriptions']['Row']
export type AppRole       = Database['public']['Enums']['app_role']
export type AIConfig      = Database['public']['Tables']['ai_configurations']['Row']
export type CrmLead       = Database['public']['Tables']['crm_leads']['Row']
export type Case          = Database['public']['Tables']['cases']['Row']
export type UserRole      = Database['public']['Tables']['user_roles']['Row']
export type Tenant        = Database['public']['Tables']['tenants']['Row']
export type Payment       = Database['public']['Tables']['payments']['Row']
export type PaymentStatus  = Database['public']['Enums']['payment_status']
export type PaymentProduct = Database['public']['Enums']['payment_product']
