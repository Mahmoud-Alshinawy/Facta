import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import Logo from "@/components/Logo";
import { Mail, Lock, LogIn, UserPlus, Inbox, ArrowLeft, KeyRound, CheckCircle2 } from "lucide-react";

type Mode = "signin" | "signup" | "forgot";

export default function AuthScreen() {
  const { signUp, signIn, resetPassword, completePasswordReset } = useAuth();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirmationSent, setConfirmationSent] = useState(false);
  const [resetCodeSent, setResetCodeSent] = useState(false);
  const [passwordUpdated, setPasswordUpdated] = useState(false);

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setResetCodeSent(false);
    setResetCode("");
    setPassword("");
    setConfirmPassword("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (mode === "forgot") {
        if (!resetCodeSent) {
          const result = await resetPassword(email);
          if (result.error) {
            setError(result.error.message);
          } else {
            setResetCodeSent(true);
          }
          return;
        }

        if (!/^\d{6}$/.test(resetCode)) {
          setError("Enter the 6-digit code from your email.");
          return;
        }
        if (password.length < 6) {
          setError("Password must be at least 6 characters.");
          return;
        }
        if (password !== confirmPassword) {
          setError("Passwords do not match.");
          return;
        }

        const result = await completePasswordReset(email, resetCode, password);
        if (result.error) {
          setError(result.error.message);
        } else {
          setPasswordUpdated(true);
        }
        return;
      }

      const fn = mode === "signin" ? signIn : signUp;
      const result = await fn(email, password);
      if (result.error) {
        setError(result.error.message);
      } else if (mode === "signup" && "autoSignedIn" in result && result.autoSignedIn) {
        setError("Account already exists — you've been signed in automatically.");
      } else if (mode === "signup" && "needsConfirmation" in result && result.needsConfirmation) {
        setConfirmationSent(true);
      }
    } finally {
      setLoading(false);
    }
  }

  if (passwordUpdated) {
    return (
      <Shell>
        <div className="text-center">
          <div className="flex items-center justify-center mb-4">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
              <CheckCircle2 size={24} className="text-primary" />
            </div>
          </div>
          <h2 className="text-lg font-medium mb-2">Password updated</h2>
          <p className="text-sm text-muted-foreground mb-6">
            Your password has been changed. You're now signed in.
          </p>
        </div>
      </Shell>
    );
  }

  if (confirmationSent) {
    return (
      <Shell>
        <div className="flex items-center justify-center mb-4">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Inbox size={24} className="text-primary" />
          </div>
        </div>
        <h2 className="text-lg font-medium mb-2">Check your email</h2>
        <p className="text-sm text-muted-foreground mb-6">
          We sent a confirmation link to <strong className="text-foreground">{email}</strong>. Click it to activate your account, then sign in.
        </p>
        <button
          onClick={() => { setConfirmationSent(false); switchMode("signin"); }}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <ArrowLeft size={15} />
          Back to Sign In
        </button>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="flex items-center gap-2 mb-6 justify-center">
        <Logo size={24} />
        <h1 className="text-xl font-semibold">Facta</h1>
      </div>

      <h2 className="text-lg font-medium text-center mb-1">
        {mode === "forgot" ? "Reset password" : mode === "signin" ? "Sign In" : "Create Account"}
      </h2>
      <p className="text-sm text-muted-foreground text-center mb-6">
        {mode === "forgot"
          ? resetCodeSent
            ? "Enter the code from your email and choose a new password."
            : "Enter your email and we'll send you a 6-digit reset code."
          : mode === "signin"
          ? "Welcome back! Sign in to continue."
          : "Get started with your free account."}
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <FieldRow label="Email" icon={<Mail size={14} />}>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </FieldRow>

        {mode === "forgot" && resetCodeSent && (
          <FieldRow label="6-digit code" icon={<KeyRound size={14} />}>
            <input
              type="text"
              required
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              value={resetCode}
              onChange={(e) => setResetCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="123456"
              autoFocus
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-input bg-background text-sm tracking-[0.3em] text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </FieldRow>
        )}

        {mode === "forgot" && resetCodeSent && (
          <>
            <FieldRow label="New password" icon={<Lock size={14} />}>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </FieldRow>
            <FieldRow label="Confirm new password" icon={<Lock size={14} />}>
              <input
                type="password"
                required
                minLength={6}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </FieldRow>
          </>
        )}

        {mode !== "forgot" && (
          <FieldRow label="Password" icon={<Lock size={14} />}>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </FieldRow>
        )}

        {error && (
          <div className="text-xs text-destructive bg-destructive/10 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {mode === "forgot" ? (resetCodeSent ? <KeyRound size={15} /> : <Inbox size={15} />) : mode === "signin" ? <LogIn size={15} /> : <UserPlus size={15} />}
          {loading
            ? "Please wait…"
            : mode === "forgot"
            ? resetCodeSent ? "Update password" : "Send reset code"
            : mode === "signin"
            ? "Sign In"
            : "Sign Up"}
        </button>
      </form>

      <div className="mt-6 flex flex-col items-center gap-2">
        {mode === "signin" && (
          <button
            onClick={() => switchMode("forgot")}
            className="text-xs text-primary hover:underline font-medium"
          >
            Forgot password?
          </button>
        )}
        <button
          onClick={() => switchMode(mode === "signin" || mode === "forgot" ? "signup" : "signin")}
          className="text-xs text-primary hover:underline font-medium"
        >
          {mode === "signin" || mode === "forgot"
            ? "Don't have an account? Sign Up"
            : "Already have an account? Sign In"}
        </button>
        {mode === "forgot" && (
          <button
            onClick={() => switchMode("signin")}
            className="text-xs text-muted-foreground hover:underline font-medium"
          >
            Back to sign in
          </button>
        )}
        {mode === "forgot" && resetCodeSent && (
          <button
            onClick={() => { setResetCodeSent(false); setResetCode(""); setError(null); }}
            className="text-xs text-muted-foreground hover:underline font-medium"
          >
            Request a new code
          </button>
        )}
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-center min-h-screen bg-background text-foreground">
      <div className="w-full max-w-sm p-8 rounded-2xl border border-border bg-card shadow-sm">
        {children}
      </div>
    </div>
  );
}

function FieldRow({
  label,
  icon,
  children,
}: {
  label: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
          {icon}
        </span>
        {children}
      </div>
    </div>
  );
}
