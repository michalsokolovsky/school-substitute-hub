import { supabase } from "@/integrations/supabase/client";

export async function getPostAuthPath(userId: string): Promise<string | null> {
  const { data: roles } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (roles?.some((r) => r.role === "admin")) return "/admin";

  const { data: teacher } = await supabase
    .from("teachers")
    .select("schedule_locked")
    .eq("user_id", userId)
    .maybeSingle();
  if (!teacher) return null;

  return teacher.schedule_locked ? "/absence" : "/schedule";
}
