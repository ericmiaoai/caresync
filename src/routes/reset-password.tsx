import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Eye, EyeOff, Check } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Reset Password — CareSync" },
      { name: "description", content: "Set a new password for your CareSync account." },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();

  // Whether Supabase has established a recovery session
  const [ready,      setReady]      = useState(false);
  // No valid recovery token found after timeout
  const [invalid,    setInvalid]    = useState(false);

  const [newPwd,     setNewPwd]     = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [showPwd,    setShowPwd]    = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done,       setDone]       = useState(false);

  const pwdChecks = {
    length:    newPwd.length >= 8,
    uppercase: /[A-Z]/.test(newPwd),
    number:    /[0-9]/.test(newPwd),
  };
  const pwdValid = Object.values(pwdChecks).every(Boolean) && newPwd === confirmPwd;

  useEffect(() => {
    // Supabase with detectSessionInUrl:true processes the recovery token
    // automatically. We listen for the resulting auth state change.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
        setReady(true);
      }
    });

    // Also check if a session already exists (fires before listener in some browsers)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setReady(true);
    });

    // If no recovery event after 6 seconds, the link is invalid or expired
    const timeout = setTimeout(() => {
      setInvalid((prev) => !prev ? true : prev);
    }, 6000);

    // Override the invalid timeout if ready fires first
    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  // Prevent invalid from flipping true if ready already fired
  const showInvalid = invalid && !ready;

  const handleSubmit = async () => {
    if (!pwdValid) return;
    setSubmitting(true);
    const { error } = await supabase.auth.updateUser({ password: newPwd });
    setSubmitting(false);
    if (error) {
      toast.error("Failed to update password", { description: error.message });
    } else {
      setDone(true);
      await supabase.auth.signOut();
      setTimeout(() => navigate({ to: "/login" }), 2500);
    }
  };

  const INPUT = "w-full rounded-lg border border-border bg-card px-3 py-2.5 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring";

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8 flex flex-col items-center gap-3">
          <img src="/logo-icon.png" alt="CareSync" className="h-14 w-14 rounded-2xl object-cover" style={{ filter: "drop-shadow(0 2px 8px rgba(0,0,0,0.25))" }} />
          <div className="text-center">
            <h1 className="text-xl font-semibold tracking-tight">CareSync</h1>
            <p className="mt-1 text-sm text-muted-foreground">Set a new password</p>
          </div>
        </div>

        {/* Success state */}
        {done && (
          <div className="rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-4 text-center">
            <p className="text-sm font-medium text-green-400">Password updated!</p>
            <p className="mt-1 text-xs text-green-400/70">Redirecting you to sign in…</p>
          </div>
        )}

        {/* Invalid / expired link */}
        {showInvalid && !done && (
          <div className="flex flex-col gap-4 text-center">
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-4">
              <p className="text-sm font-medium text-destructive">Link expired or invalid</p>
              <p className="mt-1 text-xs text-destructive/70">
                Password reset links expire after 1 hour. Please request a new one.
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate({ to: "/login" })}
              className="rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              Back to sign in
            </button>
          </div>
        )}

        {/* Loading — waiting for Supabase to exchange the token */}
        {!ready && !showInvalid && !done && (
          <div className="flex flex-col items-center gap-3 py-8">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-border border-t-foreground" />
            <p className="text-sm text-muted-foreground">Verifying reset link…</p>
          </div>
        )}

        {/* Password form */}
        {ready && !done && (
          <div className="flex flex-col gap-4">
            {/* New password */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-foreground">New password</label>
              <div className="relative">
                <input
                  type={showPwd ? "text" : "password"}
                  value={newPwd}
                  onChange={(e) => setNewPwd(e.target.value)}
                  placeholder="At least 8 characters"
                  autoFocus
                  className={`${INPUT} pr-10`}
                />
                <button
                  type="button"
                  onClick={() => setShowPwd((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                >
                  {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {newPwd.length > 0 && (
                <ul className="mt-1 flex flex-col gap-1">
                  {([
                    [pwdChecks.length,    "At least 8 characters"],
                    [pwdChecks.uppercase, "At least one uppercase letter"],
                    [pwdChecks.number,    "At least one number"],
                  ] as [boolean, string][]).map(([ok, label]) => (
                    <li key={label} className={cn("flex items-center gap-1.5 text-xs", ok ? "text-green-500" : "text-muted-foreground")}>
                      <Check className={cn("h-3 w-3", !ok && "opacity-0")} />
                      {label}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Confirm password */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-foreground">Confirm new password</label>
              <input
                type="password"
                value={confirmPwd}
                onChange={(e) => setConfirmPwd(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && pwdValid) handleSubmit(); }}
                placeholder="Re-enter new password"
                className={INPUT}
              />
              {confirmPwd.length > 0 && newPwd !== confirmPwd && (
                <p className="text-xs text-destructive">Passwords do not match</p>
              )}
            </div>

            <button
              type="button"
              onClick={handleSubmit}
              disabled={!pwdValid || submitting}
              className="mt-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {submitting ? "Updating…" : "Set new password"}
            </button>

            <button
              type="button"
              onClick={() => navigate({ to: "/login" })}
              className="text-center text-sm text-muted-foreground hover:text-foreground"
            >
              Back to sign in
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
