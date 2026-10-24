// Hand-written to match goals_events and 20261022140000_notes_diary migrations,
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
  | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5";
  };
  public: {
    Tables: {
      notes: {
        Row: {
          id: string;
          user_id: string;
          title: string | null;
          body: Json;
          color: string | null;
          tags: string[];
          pinned: boolean;
          pinned_to_widget: boolean;
          font: string | null;
          align: string | null;
          links: string[];
          trashed_at: string | null;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          user_id?: string;
          title?: string | null;
          body?: Json;
          color?: string | null;
          tags?: string[];
          pinned?: boolean;
          pinned_to_widget?: boolean;
          font?: string | null;
          align?: string | null;
          links?: string[];
          trashed_at?: string | null;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          title?: string | null;
          body?: Json;
          color?: string | null;
          tags?: string[];
          pinned?: boolean;
          pinned_to_widget?: boolean;
          font?: string | null;
          align?: string | null;
          links?: string[];
          trashed_at?: string | null;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [];
      };
      diary_entries: {
        Row: {
          id: string;
          user_id: string;
          date: string;
          one_line: string;
          mood: number;
          body: string | null;
          tags: string[];
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          user_id?: string;
          date: string;
          one_line: string;
          mood: number;
          body?: string | null;
          tags?: string[];
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          date?: string;
          one_line?: string;
          mood?: number;
          body?: string | null;
          tags?: string[];
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [];
      };
      events: {
        Row: {
          all_day: boolean;
          color: string;
          created_at: string;
          date: string;
          deleted_at: string | null;
          description: string | null;
          end_date: string | null;
          end_time: string;
          id: string;
          repeat: string;
          repeat_days: number[];
          start_time: string;
          title: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          all_day?: boolean;
          color?: string;
          created_at?: string;
          date: string;
          deleted_at?: string | null;
          description?: string | null;
          end_date?: string | null;
          end_time: string;
          id?: string;
          repeat?: string;
          repeat_days?: number[];
          start_time: string;
          title: string;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          all_day?: boolean;
          color?: string;
          created_at?: string;
          date?: string;
          deleted_at?: string | null;
          description?: string | null;
          end_date?: string | null;
          end_time?: string;
          id?: string;
          repeat?: string;
          repeat_days?: number[];
          start_time?: string;
          title?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      goals: {
        Row: {
          category: string;
          completed: boolean;
          completed_dates: string[];
          created_at: string;
          date: string;
          deleted_at: string | null;
          id: string;
          notification_message: string;
          notifications_enabled: boolean;
          repeat: string;
          repeat_days: number[];
          time: string | null;
          title: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          category: string;
          completed?: boolean;
          completed_dates?: string[];
          created_at?: string;
          date: string;
          deleted_at?: string | null;
          id?: string;
          notification_message?: string;
          notifications_enabled?: boolean;
          repeat?: string;
          repeat_days?: number[];
          time?: string | null;
          title: string;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          category?: string;
          completed?: boolean;
          completed_dates?: string[];
          created_at?: string;
          date?: string;
          deleted_at?: string | null;
          id?: string;
          notification_message?: string;
          notifications_enabled?: boolean;
          repeat?: string;
          repeat_days?: number[];
          time?: string | null;
          title?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      facta_write_diary: {
        Args: { entry: Json };
        Returns: Database["public"]["Tables"]["diary_entries"]["Row"][];
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<T extends keyof DefaultSchema["Tables"]> =
  DefaultSchema["Tables"][T]["Row"];
export type TablesInsert<T extends keyof DefaultSchema["Tables"]> =
  DefaultSchema["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof DefaultSchema["Tables"]> =
  DefaultSchema["Tables"][T]["Update"];
