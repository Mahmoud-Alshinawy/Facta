// Hand-written to match supabase/migrations/20261016120000_goals_events.sql,
// in the shape `supabase gen types typescript` emits. Once the migration is
// applied, regenerate with:
//   supabase gen types typescript --project-id <ref> --schema public > apps/desktop/src/lib/database.types.ts
// and keep the generated file if it differs.

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
      events: {
        Row: {
          all_day: boolean
          color: string
          created_at: string
          date: string
          deleted_at: string | null
          description: string | null
          end_time: string
          id: string
          repeat: string
          repeat_days: number[]
          start_time: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          all_day?: boolean
          color?: string
          created_at?: string
          date: string
          deleted_at?: string | null
          description?: string | null
          end_time: string
          id?: string
          repeat?: string
          repeat_days?: number[]
          start_time: string
          title: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          all_day?: boolean
          color?: string
          created_at?: string
          date?: string
          deleted_at?: string | null
          description?: string | null
          end_time?: string
          id?: string
          repeat?: string
          repeat_days?: number[]
          start_time?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      goals: {
        Row: {
          category: string
          completed: boolean
          completed_dates: string[]
          created_at: string
          date: string
          deleted_at: string | null
          id: string
          notification_message: string
          notifications_enabled: boolean
          repeat: string
          repeat_days: number[]
          time: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          category: string
          completed?: boolean
          completed_dates?: string[]
          created_at?: string
          date: string
          deleted_at?: string | null
          id?: string
          notification_message?: string
          notifications_enabled?: boolean
          repeat?: string
          repeat_days?: number[]
          time?: string | null
          title: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          category?: string
          completed?: boolean
          completed_dates?: string[]
          created_at?: string
          date?: string
          deleted_at?: string | null
          id?: string
          notification_message?: string
          notifications_enabled?: boolean
          repeat?: string
          repeat_days?: number[]
          time?: string | null
          title?: string
          updated_at?: string
          user_id?: string
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

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<T extends keyof DefaultSchema["Tables"]> = DefaultSchema["Tables"][T]["Row"]
export type TablesInsert<T extends keyof DefaultSchema["Tables"]> = DefaultSchema["Tables"][T]["Insert"]
export type TablesUpdate<T extends keyof DefaultSchema["Tables"]> = DefaultSchema["Tables"][T]["Update"]
