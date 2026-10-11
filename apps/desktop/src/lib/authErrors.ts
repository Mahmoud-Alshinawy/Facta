type AuthContext = "reset" | "update" | "signin" | "signup" | "general";

const FRIENDLY: Record<string, string> = {
  over_email_send_rate_limit: "Too many reset requests, try again in a few minutes.",
  email_address_invalid: "Please enter a valid email address.",
  user_not_found: "No account exists with that email.",
  password_should_be_at_least_6_chars: "Password must be at least 6 characters.",
  weak_password: "Password must be at least 6 characters.",
  same_password: "New password must be different from your current password.",
  auth_session_missing: "This reset code has expired. Please request a new one.",
  otp_expired: "This reset code has expired. Please request a new one.",
  invalid_otp: "That reset code is invalid or expired. Please request a new one.",
  email_not_confirmed: "Please confirm your email before signing in. Check your inbox for the verification link.",
  invalid_credentials: "Incorrect email or password.",
};

function extractCode(msg: string): string | null {
  const m = msg.match(/"([a-z_]+)"/i);
  return m ? m[1] : null;
}

export function humanizeAuthError(err: unknown, _context: AuthContext = "general"): string {
  const message = err instanceof Error ? err.message : String(err);
  const lower = message.toLowerCase();
  const structuredCode =
    typeof err === "object" && err !== null && "code" in err
      ? String((err as { code?: unknown }).code ?? "")
      : "";
  const code = structuredCode || extractCode(message);

  if (code && FRIENDLY[code]) return FRIENDLY[code];

  if (lower.includes("rate limit") || lower.includes("too many")) {
    return "Too many reset requests, try again in a few minutes.";
  }
  if (lower.includes("invalid otp") || lower.includes("invalid token") || lower.includes("token is invalid")) {
    return "That reset code is invalid or expired. Please request a new one.";
  }
  if (lower.includes("expired") || lower.includes("otp")) {
    return "This reset code has expired. Please request a new one.";
  }
  if (lower.includes("invalid login") || lower.includes("invalid_credentials")) {
    return "Incorrect email or password.";
  }
  if (lower.includes("email not confirmed")) {
    return "Please confirm your email before signing in. Check your inbox for the verification link.";
  }
  if (lower.includes("network") || lower.includes("fetch")) {
    return "Network error. Check your connection and try again.";
  }

  return message;
}
