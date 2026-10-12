import { createFileRoute, Outlet, redirect, Link, useRouter } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import { PENDING_CHANGED_EVENT } from "@/lib/pending-requests";
import { LogOut, Calendar, CalendarX, ListChecks, LayoutDashboard, Users, History, ChartColumn } from "lucide-react";

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
  const [pendingCount, setPendingCount] = useState(0);

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

  // Admins see how many requests are waiting for a decision next to "לוח בקרה". Refreshed every
  // minute, when the tab regains focus, and right after the dashboard decides on a request.
  useEffect(() => {
    if (!isAdmin) return;
    async function loadPending() {
      const { count } = await supabase
        .from("absence_requests")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending");
      setPendingCount(count ?? 0);
    }
    loadPending();
    const timer = setInterval(loadPending, 60_000);
    window.addEventListener("focus", loadPending);
    window.addEventListener(PENDING_CHANGED_EVENT, loadPending);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", loadPending);
      window.removeEventListener(PENDING_CHANGED_EVENT, loadPending);
    };
  }, [isAdmin]);

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
                  <NavLink
                    to="/admin"
                    icon={<LayoutDashboard className="h-4 w-4" />}
                    badge={pendingCount}
                  >
                    לוח בקרה
                  </NavLink>
                  <NavLink to="/admin/teachers" icon={<Users className="h-4 w-4" />}>מורות</NavLink>
                  <NavLink to="/admin/history" icon={<History className="h-4 w-4" />}>היסטוריה</NavLink>
                  <NavLink to="/admin/workload" icon={<ChartColumn className="h-4 w-4" />}>עומס ממלאות</NavLink>
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

function NavLink({
  to,
  icon,
  badge,
  children,
}: {
  to: string;
  icon: React.ReactNode;
  badge?: number;
  children: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-foreground hover:bg-secondary [&.active]:bg-primary [&.active]:text-primary-foreground"
      activeProps={{ className: "active" }}
    >
      {icon}
      {children}
      {badge ? (
        <span
          className="inline-flex min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-xs font-medium leading-5 text-destructive-foreground"
          aria-label={`${badge} בקשות ממתינות`}
        >
          {badge}
        </span>
      ) : null}
    </Link>
  );
}