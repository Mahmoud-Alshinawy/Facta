import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";
import { humanizeAuthError } from "@/lib/authErrors";

const DEFAULT_AUTH_REDIRECT = "facta://auth/callback";
const AUTH_REDIRECT_TO =
  (import.meta.env.VITE_AUTH_REDIRECT_URL as string | undefined)?.trim() ||
  DEFAULT_AUTH_REDIRECT;

interface AuthState {
  user: User | null;
  loading: boolean;
  signUp: (email: string, password: string) => Promise<{ error: Error | null; needsConfirmation?: boolean; autoSignedIn?: boolean }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: Error | null }>;
  completePasswordReset: (email: string, token: string, newPassword: string) => Promise<{ error: Error | null }>;
}

const AuthContext = createContext<AuthState>({
  user: null,
  loading: true,
  signUp: async () => ({ error: null }),
  signIn: async () => ({ error: null }),
  signOut: async () => {},
  resetPassword: async () => ({ error: null }),
  completePasswordReset: async () => ({ error: null }),
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: AUTH_REDIRECT_TO },
    });

    if (error) return { error };

    if (!data.session && data.user) {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (!signInError) {
        return { error: null, needsConfirmation: false, autoSignedIn: true };
      }
      if (signInError.message.includes("Email not confirmed")) {
        return {
          error: new Error("This email is already registered but not confirmed. Please check your inbox for the verification link."),
          needsConfirmation: true,
        };
      }
      if (signInError.message.includes("Invalid login")) {
        return {
          error: new Error("An account with this email already exists. Please sign in with your existing password."),
          needsConfirmation: false,
        };
      }
      return { error: null, needsConfirmation: true };
    }

    return { error: null, needsConfirmation: false };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: new Error(humanizeAuthError(error, "signin")) };
    return { error: null };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    if (error) return { error: new Error(humanizeAuthError(error, "reset")) };
    return { error: null };
  }, []);

  const completePasswordReset = useCallback(async (email: string, token: string, newPassword: string) => {
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email,
      token,
      type: "recovery",
    });
    if (verifyError) {
      return { error: new Error(humanizeAuthError(verifyError, "update")) };
    }

    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) return { error: new Error(humanizeAuthError(error, "update")) };
    return { error: null };
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        signUp,
        signIn,
        signOut,
        resetPassword,
        completePasswordReset,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

export function getStorageKey(base: string, userId: string | null | undefined) {
  return `${base}_${userId ?? "anon"}`;
}
