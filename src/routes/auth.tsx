import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth")({
  ssr: false,
  component: AuthPage,
});

function AuthPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) router.navigate({ to: "/", replace: true });
    });
  }, [router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setLoading(false);
      if (error) {
        setError("אימייל או סיסמה שגויים");
        return;
      }
      router.navigate({ to: "/", replace: true });
    } else {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: window.location.origin },
      });
      setLoading(false);
      if (error) {
        setError(error.message || "ההרשמה נכשלה");
        return;
      }
      if (data.session) {
        router.navigate({ to: "/", replace: true });
      } else {
        setInfo("נשלח אימייל לאימות החשבון. לאחר האימות ניתן להתחבר.");
      }
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-xl border bg-card p-8 shadow-sm">
        <h1 className="text-2xl font-bold text-foreground">{mode === "signin" ? "התחברות" : "הרשמה"}</h1>
        <p className="mt-1 text-sm text-muted-foreground">מערכת ניהול מורות ממלאות מקום</p>
        <div className="mt-4 grid grid-cols-2 gap-1 rounded-md bg-muted p-1 text-sm">
          <button
            type="button"
            onClick={() => { setMode("signin"); setError(null); setInfo(null); }}
            className={`rounded px-3 py-1.5 font-medium transition ${mode === "signin" ? "bg-background shadow-sm" : "text-muted-foreground"}`}
          >
            התחברות
          </button>
          <button
            type="button"
            onClick={() => { setMode("signup"); setError(null); setInfo(null); }}
            className={`rounded px-3 py-1.5 font-medium transition ${mode === "signup" ? "bg-background shadow-sm" : "text-muted-foreground"}`}
          >
            הרשמה
          </button>
        </div>
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
          {error && <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}
          {info && <div className="rounded-md bg-primary/10 px-3 py-2 text-sm text-foreground">{info}</div>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            {loading ? "רגע..." : mode === "signin" ? "התחברות" : "הרשמה"}
          </button>
        </form>
      </div>
    </div>
  );
}