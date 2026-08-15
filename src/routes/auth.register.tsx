import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { setupTeacherProfile } from "@/lib/auth.functions";
import { GoogleSignInButton } from "@/components/google-sign-in-button";
import { getPostAuthPath } from "@/lib/auth-routing";
import { PASSWORD_HINT, PASSWORD_MIN_LENGTH, validatePassword } from "@/lib/password";

export const Route = createFileRoute("/auth/register")({
  ssr: false,
  component: RegisterPage,
});

function RegisterPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [type, setType] = useState<"regular" | "external">("regular");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [existingUser, setExistingUser] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const setupFn = useServerFn(setupTeacherProfile);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        setChecking(false);
        return;
      }
      const path = await getPostAuthPath(data.user.id);
      if (path) {
        router.navigate({ to: path, replace: true });
        return;
      }
      setExistingUser(true);
      setEmail(data.user.email ?? "");
      const meta = data.user.user_metadata ?? {};
      if (meta.full_name) setFullName(String(meta.full_name));
      if (meta.phone) setPhone(String(meta.phone));
      if (meta.type === "external") setType("external");
      setChecking(false);
    })();
  }, [router]);

  async function finishRegistration() {
    await setupFn({
      data: {
        full_name: fullName.trim(),
        phone: phone.trim() || null,
        type,
      },
    });
    const { data } = await supabase.auth.getUser();
    if (!data.user) return;
    const path = (await getPostAuthPath(data.user.id)) ?? "/schedule";
    router.navigate({ to: path, replace: true });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!existingUser) {
      const passwordError = validatePassword(password);
      if (passwordError) {
        setError(passwordError);
        return;
      }
    }
    setLoading(true);
    try {
      if (existingUser) {
        await finishRegistration();
        return;
      }
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            full_name: fullName.trim(),
            phone: phone.trim() || null,
            type,
          },
        },
      });
      if (signUpError) {
        setError(
          signUpError.message.includes("already registered")
            ? "האימייל כבר רשום — נסי להתחבר"
            : "לא הצלחנו ליצור חשבון. נסי שוב.",
        );
        return;
      }
      if (data.session) {
        await finishRegistration();
        return;
      }
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בהרשמה");
    } finally {
      setLoading(false);
    }
  }

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-muted-foreground">טוען...</p>
      </div>
    );
  }

  if (done) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-md rounded-xl border bg-card p-8 text-center shadow-sm">
          <h1 className="text-xl font-bold">ההרשמה הצליחה!</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            אם נדרש אימות מייל — בדקי את תיבת הדואר (וגם ספאם) ואז התחברי.
          </p>
          <Link to="/auth" className="mt-4 inline-block text-sm font-medium text-primary hover:underline">
            מעבר להתחברות
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-xl border bg-card p-8 shadow-sm">
        <h1 className="text-2xl font-bold text-foreground">הרשמת מורה</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {existingUser ? "השלימי את פרטי המורה שלך" : "צרי חשבון והגדירי סיסמה משלך"}
        </p>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">שם מלא</label>
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">אימייל</label>
            <input
              type="email"
              required
              readOnly={existingUser}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring read-only:opacity-70"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">טלפון (אופציונלי)</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">סוג</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as "regular" | "external")}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="regular">מורה בצוות (פנימית)</option>
              <option value="external">ממלאת מקום חיצונית</option>
            </select>
          </div>
          {!existingUser && (
            <div>
              <label className="mb-1 block text-sm font-medium">סיסמה</label>
              <input
                type="password"
                required
                minLength={PASSWORD_MIN_LENGTH}
                aria-describedby="password-hint"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <p id="password-hint" className="mt-1 text-xs text-muted-foreground">
                {PASSWORD_HINT}
              </p>
            </div>
          )}
          {error && (
            <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            {loading ? "רגע..." : existingUser ? "השלמת הרשמה" : "הרשמה"}
          </button>
        </form>
        {!existingUser && (
          <>
            <div className="my-6 flex items-center gap-3">
              <span className="h-px flex-1 bg-border" />
              <span className="text-xs text-muted-foreground">או</span>
              <span className="h-px flex-1 bg-border" />
            </div>
            <GoogleSignInButton label="הרשמה עם גוגל" onError={setError} />
            <p className="mt-2 text-center text-xs text-muted-foreground">
              אחרי ההתחברות עם גוגל נבקש ממך להשלים פרטי מורה
            </p>
          </>
        )}
        <p className="mt-4 text-center text-sm text-muted-foreground">
          כבר יש לך חשבון?{" "}
          <Link to="/auth" className="font-medium text-primary hover:underline">
            התחברות
          </Link>
        </p>
      </div>
    </div>
  );
}
