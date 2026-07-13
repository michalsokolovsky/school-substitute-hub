import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { useRouter } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

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
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userRes.user.id);
      const isAdmin = roles?.some((r) => r.role === "admin");
      if (isAdmin) {
        router.navigate({ to: "/admin", replace: true });
      } else {
        const { data: teacher } = await supabase
          .from("teachers")
          .select("schedule_locked")
          .eq("user_id", userRes.user.id)
          .maybeSingle();
        if (teacher && !teacher.schedule_locked) {
          router.navigate({ to: "/schedule", replace: true });
        } else {
          router.navigate({ to: "/absence", replace: true });
        }
      }
    })();
  }, [router]);
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <p className="text-muted-foreground">טוען...</p>
    </div>
  );
}
