import { createFileRoute, Outlet, redirect, Link, useRouter } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import { LogOut, Calendar, CalendarX, ListChecks, LayoutDashboard, Users, History } from "lucide-react";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthLayout,
});

function AuthLayout() {
  const { user } = Route.useRouteContext();
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState(false);
  const [teacherName, setTeacherName] = useState<string>("");

  useEffect(() => {
    (async () => {
      const [{ data: roles }, { data: teacher }] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", user.id),
        supabase.from("teachers").select("full_name").eq("user_id", user.id).maybeSingle(),
      ]);
      setIsAdmin(!!roles?.some((r) => r.role === "admin"));
      setTeacherName(teacher?.full_name ?? user.email ?? "");
    })();
  }, [user.id, user.email]);

  async function signOut() {
    await supabase.auth.signOut();
    router.navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-6">
            <nav className="flex items-center gap-1 text-sm">
              {isAdmin ? (
                <>
                  <NavLink to="/admin" icon={<LayoutDashboard className="h-4 w-4" />}>לוח בקרה</NavLink>
                  <NavLink to="/admin/teachers" icon={<Users className="h-4 w-4" />}>מורות</NavLink>
                  <NavLink to="/admin/history" icon={<History className="h-4 w-4" />}>היסטוריה</NavLink>
                </>
              ) : (
                <>
                  <NavLink to="/schedule" icon={<Calendar className="h-4 w-4" />}>מערכת שבועית</NavLink>
                  <NavLink to="/absence" icon={<CalendarX className="h-4 w-4" />}>דיווח היעדרות</NavLink>
                  <NavLink to="/my-requests" icon={<ListChecks className="h-4 w-4" />}>הבקשות שלי</NavLink>
                </>
              )}
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-muted-foreground">{teacherName}</span>
            <button
              onClick={signOut}
              className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm hover:bg-secondary"
            >
              <LogOut className="h-4 w-4" />
              יציאה
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-6">
        <Outlet />
      </main>
    </div>
  );
}

function NavLink({ to, icon, children }: { to: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-foreground hover:bg-secondary [&.active]:bg-primary [&.active]:text-primary-foreground"
      activeProps={{ className: "active" }}
    >
      {icon}
      {children}
    </Link>
  );
}