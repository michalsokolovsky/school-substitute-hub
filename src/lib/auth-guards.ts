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

export async function anyAdminExists() {
  const { count } = await supabase
    .from("user_roles")
    .select("*", { count: "exact", head: true })
    .eq("role", "admin");
  return (count ?? 0) > 0;
}

/** Redirect non-admins. When allowBootstrap is true, permits access if no admin exists yet. */
export async function requireAdmin(options?: { allowBootstrap?: boolean }) {
  const user = await getAuthUser();
  const isAdmin = await userIsAdmin(user.id);
  if (isAdmin) return { user, isAdmin: true as const, bootstrap: false as const };

  if (options?.allowBootstrap && !(await anyAdminExists())) {
    return { user, isAdmin: false as const, bootstrap: true as const };
  }

  throw redirect({ to: "/" });
}
