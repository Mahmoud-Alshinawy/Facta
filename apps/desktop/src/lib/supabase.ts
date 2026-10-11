import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "placeholder";

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  realtime: {
    params: { eventsPerSecond: 10 },
  },
});

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: { invite_code: string; user_id: string; display_name: string; created_at: string };
        Insert: { invite_code: string; user_id: string; display_name: string };
        Update: { display_name?: string };
      };
      daily_stats: {
        Row: { id: string; user_id: string; completed: number; total: number; rate: number; date: string; updated_at: string };
        Insert: { id: string; user_id: string; completed: number; total: number; rate: number; date: string };
        Update: { completed?: number; total?: number; rate?: number; updated_at?: string };
      };
      monthly_stats: {
        Row: { id: string; user_id: string; year_month: string; days_tracked: number; sum_rate: number; avg_rate: number; last_updated: string };
        Insert: { id: string; user_id: string; year_month: string; days_tracked: number; sum_rate: number; avg_rate: number };
        Update: { days_tracked?: number; sum_rate?: number; avg_rate?: number; last_updated?: string };
      };
      reactions: {
        Row: { invite_code: string; from_name: string; emoji: string; sent_at: string; seen: boolean };
        Insert: { invite_code: string; from_name: string; emoji: string; seen?: boolean };
        Update: { seen?: boolean };
      };
    };
  };
}
