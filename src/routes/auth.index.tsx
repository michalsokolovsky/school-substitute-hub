import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { GoogleSignInButton } from "@/components/google-sign-in-button";
import { getPostAuthPath } from "@/lib/auth-routing";

export const Route = createFileRoute("/auth/")({
  ssr: false,
  component: AuthPage,
});

function AuthPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) return;
      const path = await getPostAuthPath(data.user.id);
      if (path) router.navigate({ to: path, replace: true });
    })();
  }, [router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (signInError) {
      setError("אימייל או סיסמה שגויים");
      return;
    }
    router.navigate({ to: "/", replace: true });
  }

  async function onForgotPassword() {
    if (!email) {
      setError("הזיני את האימייל שלך ואז לחצי על שכחתי סיסמה");
      return;
    }
    setError(null);
    setResetLoading(true);
    const redirectTo = `${window.location.origin}/auth/reset-password`;
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    setResetLoading(false);
    if (resetError) {
      setError("לא הצלחנו לשלוח מייל איפוס. נסי שוב.");
      return;
    }
    setResetSent(true);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-xl border bg-card p-8 shadow-sm">
        <h1 className="text-2xl font-bold text-foreground">התחברות</h1>
        <p className="mt-1 text-sm text-muted-foreground">מערכת ניהול מורות ממלאות מקום</p>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">אימייל</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">סיסמה</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          {error && (
            <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>
          )}
          {resetSent && (
            <div className="rounded-md bg-primary/10 px-3 py-2 text-sm text-foreground">
              נשלח מייל עם קישור לאיפוס סיסמה. בדקי גם בתיקיית הספאם.
            </div>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            {loading ? "רגע..." : "התחברות"}
          </button>
          <button
            type="button"
            onClick={onForgotPassword}
            disabled={resetLoading}
            className="w-full text-sm text-muted-foreground hover:text-foreground disabled:opacity-60"
          >
            {resetLoading ? "שולח..." : "שכחתי סיסמה"}
          </button>
        </form>
        <div className="my-6 flex items-center gap-3">
          <span className="h-px flex-1 bg-border" />
          <span className="text-xs text-muted-foreground">או</span>
          <span className="h-px flex-1 bg-border" />
        </div>
        <GoogleSignInButton onError={setError} />
        <div className="mt-6 border-t pt-4">
          <p className="mb-3 text-center text-sm text-muted-foreground">מורה חדשה?</p>
          <Link
            to="/auth/register"
            className="flex w-full items-center justify-center rounded-md border border-primary bg-primary/5 px-4 py-2 text-sm font-medium text-primary hover:bg-primary/10"
          >
            הרשמה למערכת
          </Link>
        </div>
      </div>
    </div>
  );
}
