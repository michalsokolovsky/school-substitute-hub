import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { useRouter } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { getPostAuthPath } from "@/lib/auth-routing";

export const Route = createFileRoute("/")({
  ssr: false,
  component: Index,
});

function Index() {
  const router = useRouter();
  useEffect(() => {
    (async () => {
      const { data: userRes } = await supabase.auth.getUser();
      if (!userRes.user) {
        router.navigate({ to: "/auth", replace: true });
        return;
      }
      const path = await getPostAuthPath(userRes.user.id);
      if (path) {
        router.navigate({ to: path, replace: true });
        return;
      }
      router.navigate({ to: "/auth/register", replace: true });
    })();
  }, [router]);
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <p className="text-muted-foreground">טוען...</p>
    </div>
  );
}
