// Hand-written to match personal migrations and 20261024160000_shared_goals.
// Shared columns, defaults and foreign keys checked against disposable PostgreSQL.
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
      shared_profiles: {
        Row: {
          user_id: string;
          handle: string;
          display_name: string;
          created_at: string;
          updated_at: string;
          revision: number;
          deleted_at: string | null;
        };
        Insert: {
          user_id: string;
          handle: string;
          display_name: string;
          created_at?: string;
          updated_at?: string;
          revision?: number;
          deleted_at?: string | null;
        };
        Update: {
          user_id?: string;
          handle?: string;
          display_name?: string;
          created_at?: string;
          updated_at?: string;
          revision?: number;
          deleted_at?: string | null;
        };
        Relationships: [];
      };
      shared_groups: {
        Row: {
          id: string;
          owner_id: string;
          name: string;
          icon: string;
          template: string;
          schedule_kind: string;
          weekdays: number[];
          times_per_week: number | null;
          time_zone: string;
          round_weekday: number;
          first_round_date: string | null;
          published_at: string | null;
          archived_at: string | null;
          created_at: string;
          updated_at: string;
          revision: number;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          owner_id: string;
          name: string;
          icon?: string;
          template: string;
          schedule_kind: string;
          weekdays?: number[];
          times_per_week?: number | null;
          time_zone: string;
          round_weekday: number;
          first_round_date?: string | null;
          published_at?: string | null;
          archived_at?: string | null;
          created_at?: string;
          updated_at?: string;
          revision?: number;
          deleted_at?: string | null;
        };
        Update: {
          id?: string;
          owner_id?: string;
          name?: string;
          icon?: string;
          template?: string;
          schedule_kind?: string;
          weekdays?: number[];
          times_per_week?: number | null;
          time_zone?: string;
          round_weekday?: number;
          first_round_date?: string | null;
          published_at?: string | null;
          archived_at?: string | null;
          created_at?: string;
          updated_at?: string;
          revision?: number;
          deleted_at?: string | null;
        };
        Relationships: [];
      };
      shared_memberships: {
        Row: {
          id: string;
          group_id: string;
          user_id: string;
          joined_at: string;
          eligible_round: string | null;
          left_at: string | null;
          initial_gym_target: number | null;
          created_at: string;
          updated_at: string;
          revision: number;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          group_id: string;
          user_id: string;
          joined_at: string;
          eligible_round?: string | null;
          left_at?: string | null;
          initial_gym_target?: number | null;
          created_at?: string;
          updated_at?: string;
          revision?: number;
          deleted_at?: string | null;
        };
        Update: {
          id?: string;
          group_id?: string;
          user_id?: string;
          joined_at?: string;
          eligible_round?: string | null;
          left_at?: string | null;
          initial_gym_target?: number | null;
          created_at?: string;
          updated_at?: string;
          revision?: number;
          deleted_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "shared_memberships_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "shared_groups";
            referencedColumns: ["id"];
          },
        ];
      };
      shared_targets: {
        Row: {
          id: string;
          membership_id: string;
          effective_round: string;
          target: number;
          created_at: string;
          updated_at: string;
          revision: number;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          membership_id: string;
          effective_round: string;
          target: number;
          created_at?: string;
          updated_at?: string;
          revision?: number;
          deleted_at?: string | null;
        };
        Update: {
          id?: string;
          membership_id?: string;
          effective_round?: string;
          target?: number;
          created_at?: string;
          updated_at?: string;
          revision?: number;
          deleted_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "shared_targets_membership_id_fkey";
            columns: ["membership_id"];
            isOneToOne: false;
            referencedRelation: "shared_memberships";
            referencedColumns: ["id"];
          },
        ];
      };
      shared_invites: {
        Row: {
          id: string;
          group_id: string;
          inviter_id: string;
          recipient_id: string | null;
          kind: string;
          state: string;
          expires_at: string;
          created_at: string;
          updated_at: string;
          revision: number;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          group_id: string;
          inviter_id: string;
          recipient_id?: string | null;
          kind: string;
          state?: string;
          expires_at: string;
          created_at?: string;
          updated_at?: string;
          revision?: number;
          deleted_at?: string | null;
        };
        Update: {
          id?: string;
          group_id?: string;
          inviter_id?: string;
          recipient_id?: string | null;
          kind?: string;
          state?: string;
          expires_at?: string;
          created_at?: string;
          updated_at?: string;
          revision?: number;
          deleted_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "shared_invites_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "shared_groups";
            referencedColumns: ["id"];
          },
        ];
      };
      shared_checkins: {
        Row: {
          id: string;
          group_id: string;
          user_id: string;
          membership_id: string;
          checkin_date: string;
          completed: boolean;
          captured_at: string;
          created_at: string;
          updated_at: string;
          revision: number;
        };
        Insert: {
          id?: string;
          group_id: string;
          user_id: string;
          membership_id: string;
          checkin_date: string;
          completed: boolean;
          captured_at: string;
          created_at?: string;
          updated_at?: string;
          revision?: number;
        };
        Update: {
          id?: string;
          group_id?: string;
          user_id?: string;
          membership_id?: string;
          checkin_date?: string;
          completed?: boolean;
          captured_at?: string;
          created_at?: string;
          updated_at?: string;
          revision?: number;
        };
        Relationships: [
          {
            foreignKeyName: "shared_checkins_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "shared_groups";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "shared_checkins_membership_id_group_id_user_id_fkey";
            columns: ["membership_id", "group_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "shared_memberships";
            referencedColumns: ["id", "group_id", "user_id"];
          },
        ];
      };
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
      shared_goal_rounds: {
        Row: {
          group_id: string | null;
          round_start: string | null;
          round_end: string | null;
          activity_start: string | null;
          scheduled_end: string | null;
          activity_end: string | null;
          roster_size: number | null;
          end_reason: string | null;
          is_active: boolean | null;
        };
        Relationships: [];
      };
      shared_goal_round_scores: {
        Row: {
          group_id: string | null;
          round_start: string | null;
          round_end: string | null;
          activity_start: string | null;
          scheduled_end: string | null;
          activity_end: string | null;
          roster_size: number | null;
          end_reason: string | null;
          is_active: boolean | null;
          membership_id: string | null;
          user_id: string | null;
          display_name: string | null;
          handle: string | null;
          target: number | null;
          completed_days: number | null;
          left_at: string | null;
          adherence_pct: number | null;
          is_at_least_70: boolean | null;
          rank: number | null;
          group_average_pct: number | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      facta_shared_command: {
        Args: { command_id: string; operation: string; payload: Json };
        Returns: Json;
      };
      facta_shared_preview: {
        Args: { token: string };
        Returns: Json;
      };
      facta_shared_pending_invites: {
        Args: Record<PropertyKey, never>;
        Returns: Json;
      };
      facta_shared_snapshot: {
        Args: { history_from: string; history_until: string };
        Returns: Json;
      };
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
