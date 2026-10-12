import { useEffect, useState, type ReactNode } from "react";
import { addMonths, format, startOfMonth } from "date-fns";
import { CalendarX, CircleCheck, Hourglass, Trophy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PENDING_CHANGED_EVENT } from "@/lib/pending-requests";
import { Skeleton } from "@/components/ui/skeleton";

type Stats = {
  pending: number;
  absentToday: number;
  filledThisMonth: number;
  busiest: { name: string; lessons: number } | null;
};

type FilledLesson = {
  substitute_teacher_id: string;
  teachers: { full_name: string } | null;
};

async function loadStats(): Promise<Stats> {
  const now = new Date();
  const today = format(now, "yyyy-MM-dd");
  const monthStart = format(startOfMonth(now), "yyyy-MM-dd");
  const nextMonthStart = format(startOfMonth(addMonths(now, 1)), "yyyy-MM-dd");

  const [pending, absentToday, filled] = await Promise.all([
    supabase
      .from("absence_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
    supabase
      .from("absence_requests")
      .select("id", { count: "exact", head: true })
      .eq("absence_date", today)
      .in("status", ["pending", "approved"]),
    supabase
      .from("absence_lessons")
      .select("substitute_teacher_id, teachers:substitute_teacher_id(full_name)")
      .eq("status", "approved")
      .not("substitute_teacher_id", "is", null)
      .gte("absence_date", monthStart)
      .lt("absence_date", nextMonthStart),
  ]);
  const failure = pending.error ?? absentToday.error ?? filled.error;
  if (failure) throw failure;

  const lessons = (filled.data ?? []) as unknown as FilledLesson[];
  const bySubstitute = new Map<string, { name: string; lessons: number }>();
  for (const lesson of lessons) {
    const entry = bySubstitute.get(lesson.substitute_teacher_id) ?? {
      name: lesson.teachers?.full_name ?? "—",
      lessons: 0,
    };
    entry.lessons++;
    bySubstitute.set(lesson.substitute_teacher_id, entry);
  }
  // Same ordering as the workload report: most lessons first, then by name.
  const busiest =
    [...bySubstitute.values()].sort(
      (a, b) => b.lessons - a.lessons || a.name.localeCompare(b.name, "he"),
    )[0] ?? null;

  return {
    pending: pending.count ?? 0,
    absentToday: absentToday.count ?? 0,
    filledThisMonth: lessons.length,
    busiest,
  };
}

/** Counts up from 0 to `target`; jumps straight to it when the user prefers reduced motion. */
function useCountUp(target: number) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setValue(target);
      return;
    }
    const duration = 700;
    let frame = 0;
    let start: number | null = null;
    const step = (time: number) => {
      start ??= time;
      const progress = Math.min((time - start) / duration, 1);
      setValue(Math.round(target * (1 - Math.pow(1 - progress, 3))));
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target]);
  return value;
}

function CountUp({ value }: { value: number }) {
  return <>{useCountUp(value)}</>;
}

function StatCard({
  label,
  icon,
  tone,
  sub,
  children,
}: {
  label: string;
  icon: ReactNode;
  tone: string;
  sub: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border bg-card p-4 transition duration-200 hover:-translate-y-0.5 hover:shadow-sm">
      <div className="mb-2.5 flex items-center justify-between">
        <span className="text-[13px] text-muted-foreground">{label}</span>
        <span className={`flex h-[30px] w-[30px] items-center justify-center rounded-lg ${tone}`}>
          {icon}
        </span>
      </div>
      <div className="text-3xl font-medium leading-tight">{children}</div>
      <div className="mt-1 text-xs text-muted-foreground">{sub}</div>
    </div>
  );
}

function StatCardSkeleton({ wide }: { wide?: boolean }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="mb-2.5 flex items-center justify-between">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-[30px] w-[30px] rounded-lg" />
      </div>
      <Skeleton className={`h-8 ${wide ? "w-24" : "w-12"}`} />
      <Skeleton className="mt-2 h-2.5 w-20" />
    </div>
  );
}

export function AdminStatsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-hidden="true">
      <StatCardSkeleton />
      <StatCardSkeleton />
      <StatCardSkeleton />
      <StatCardSkeleton wide />
    </div>
  );
}

export function AdminStats() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    function refresh() {
      loadStats().then(
        (next) => {
          if (cancelled) return;
          setStats(next);
          setFailed(false);
        },
        (err: unknown) => {
          if (cancelled) return;
          console.error("admin stats failed", err instanceof Error ? err.message : err);
          setFailed(true);
        },
      );
    }
    refresh();
    // The admin just decided on a request, so the numbers changed.
    window.addEventListener(PENDING_CHANGED_EVENT, refresh);
    return () => {
      cancelled = true;
      window.removeEventListener(PENDING_CHANGED_EVENT, refresh);
    };
  }, []);

  // The stats are a bonus; if they fail the request list below still works.
  if (failed && !stats) return null;
  if (!stats) return <AdminStatsSkeleton />;

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard
        label="בקשות ממתינות"
        icon={<Hourglass className="h-[18px] w-[18px]" />}
        tone="bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400"
        sub={stats.pending === 0 ? "הכול טופל" : "ממתינות להחלטה"}
      >
        <CountUp value={stats.pending} />
      </StatCard>
      <StatCard
        label="היעדרויות היום"
        icon={<CalendarX className="h-[18px] w-[18px]" />}
        tone="bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400"
        sub="מורות נעדרות"
      >
        <CountUp value={stats.absentToday} />
      </StatCard>
      <StatCard
        label="שיעורים שמולאו"
        icon={<CircleCheck className="h-[18px] w-[18px]" />}
        tone="bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400"
        sub="מתחילת החודש"
      >
        <CountUp value={stats.filledThisMonth} />
      </StatCard>
      <StatCard
        label="הכי עמוסה החודש"
        icon={<Trophy className="h-[18px] w-[18px]" />}
        tone="bg-primary/10 text-primary"
        sub={stats.busiest ? `${stats.busiest.lessons} שיעורים` : "אין עדיין שיעורים מאושרים"}
      >
        <span className="text-xl">{stats.busiest?.name ?? "—"}</span>
      </StatCard>
    </div>
  );
}
