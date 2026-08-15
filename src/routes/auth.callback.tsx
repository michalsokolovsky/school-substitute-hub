import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getPostAuthPath } from "@/lib/auth-routing";

export const Route = createFileRoute("/auth/callback")({
  ssr: false,
  component: AuthCallbackPage,
});

/** Implicit-flow sessions are parsed from the URL hash asynchronously, so poll briefly. */
const SESSION_TIMEOUT_MS = 8000;

function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let settled = false;

    async function goToNextPage(userId: string) {
      if (settled) return;
      settled = true;
      const path = (await getPostAuthPath(userId)) ?? "/auth/register";
      router.navigate({ to: path, replace: true });
    }

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) goToNextPage(session.user.id);
    });

    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        setError("ההתחברות לא הושלמה. נסי שוב מדף ההתחברות.");
      }
    }, SESSION_TIMEOUT_MS);

    (async () => {
      const params = new URLSearchParams(window.location.search);
      const oauthError = params.get("error_description") ?? params.get("error");
      if (oauthError) {
        settled = true;
        setError("ההתחברות עם גוגל בוטלה או נכשלה. נסי שוב.");
        return;
      }

      const code = params.get("code");
      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError && !settled) {
          settled = true;
          setError("לא הצלחנו להשלים את ההתחברות. נסי שוב.");
          return;
        }
      }

      const { data } = await supabase.auth.getSession();
      if (data.session?.user) goToNextPage(data.session.user.id);
    })();

    return () => {
      clearTimeout(timeout);
      subscription.subscription.unsubscribe();
    };
  }, [router]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-md rounded-xl border bg-card p-8 text-center shadow-sm">
          <h1 className="text-xl font-bold text-foreground">ההתחברות לא הושלמה</h1>
          <p className="mt-2 text-sm text-muted-foreground">{error}</p>
          <Link
            to="/auth"
            className="mt-4 inline-block text-sm font-medium text-primary hover:underline"
          >
            חזרה להתחברות
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <p className="text-muted-foreground">מתחבר...</p>
    </div>
  );
}
