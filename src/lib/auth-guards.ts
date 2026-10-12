import { redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export async function getAuthUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw redirect({ to: "/auth" });
  return data.user;
}

export async function userIsAdmin(userId: string) {
  const { data: roles } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  return !!roles?.some((r) => r.role === "admin");
}

/** Redirect non-admins. */
export async function requireAdmin() {
  const user = await getAuthUser();
  const isAdmin = await userIsAdmin(user.id);
  if (isAdmin) return { user, isAdmin: true as const };

  throw redirect({ to: "/" });
}
