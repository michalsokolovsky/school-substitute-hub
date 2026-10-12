import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { requireAdmin } from "@/lib/auth-guards";
import { downloadXlsx } from "@/lib/export-xlsx";

export const Route = createFileRoute("/_authenticated/admin/workload")({
  beforeLoad: () => requireAdmin(),
  component: AdminWorkload,
});

type LessonRow = {
  absence_date: string;
  status: "pending" | "approved";
  substitute_teacher_id: string;
  teachers: { full_name: string; type: "regular" | "external" } | null;
};

type SubstituteSummary = {
  name: string;
  type: "regular" | "external";
  approved: number;
  pending: number;
  days: Set<string>;
};

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/** First day of the month and of the next one, as YYYY-MM-DD strings for the date filter. */
function monthRange(month: string) {
  const [year, number] = month.split("-").map(Number);
  const next = number === 12 ? `${year + 1}-01` : `${year}-${String(number + 1).padStart(2, "0")}`;
  return { start: `${month}-01`, end: `${next}-01` };
}

function monthLabel(month: string) {
  const [year, number] = month.split("-").map(Number);
  return new Date(year, number - 1, 1).toLocaleDateString("he-IL", {
    month: "long",
    year: "numeric",
  });
}

function AdminWorkload() {
  const [month, setMonth] = useState(currentMonth);
  const [lessons, setLessons] = useState<LessonRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!/^\d{4}-\d{2}$/.test(month)) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      const { start, end } = monthRange(month);
      const { data, error: queryError } = await supabase
        .from("absence_lessons")
        .select(
          "absence_date, status, substitute_teacher_id, teachers:substitute_teacher_id(full_name, type)",
        )
        .in("status", ["approved", "pending"])
        .not("substitute_teacher_id", "is", null)
        .gte("absence_date", start)
        .lt("absence_date", end);
      if (cancelled) return;
      if (queryError) setError(queryError.message);
      setLessons(queryError ? [] : ((data ?? []) as unknown as LessonRow[]));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [month]);

  const summary = useMemo(() => {
    const bySubstitute = new Map<string, SubstituteSummary>();
    for (const lesson of lessons) {
      let entry = bySubstitute.get(lesson.substitute_teacher_id);
      if (!entry) {
        entry = {
          name: lesson.teachers?.full_name ?? "—",
          type: lesson.teachers?.type ?? "regular",
          approved: 0,
          pending: 0,
          days: new Set(),
        };
        bySubstitute.set(lesson.substitute_teacher_id, entry);
      }
      if (lesson.status === "approved") {
        entry.approved++;
        entry.days.add(lesson.absence_date);
      } else {
        entry.pending++;
      }
    }
    return [...bySubstitute.values()].sort(
      (a, b) =>
        b.approved - a.approved || b.pending - a.pending || a.name.localeCompare(b.name, "he"),
    );
  }, [lessons]);

  const totalApproved = summary.reduce((sum, s) => sum + s.approved, 0);
  const totalPending = summary.reduce((sum, s) => sum + s.pending, 0);
  const maxApproved = Math.max(1, ...summary.map((s) => s.approved));

  function exportToExcel() {
    downloadXlsx(
      `workload-${month}.xlsx`,
      "עומס ממלאות",
      summary.map((s) => ({
        "ממלאת מקום": s.name,
        סוג: s.type === "external" ? "חיצונית" : "פנימית",
        "שיעורים שאושרו": s.approved,
        "ימים שאושרו": s.days.size,
        "שיעורים ממתינים לאישור": s.pending,
      })),
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">עומס ממלאות</h1>
          <p className="text-sm text-muted-foreground">
            כמה שיעורי מילוי כל ממלאת עשתה ב{monthLabel(month)}, לפי תאריך ההיעדרות.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="month"
            value={month}
            onChange={(e) => e.target.value && setMonth(e.target.value)}
            aria-label="חודש"
            className="rounded-md border bg-background px-2 py-1.5 text-sm"
          />
          <button
            type="button"
            onClick={exportToExcel}
            disabled={summary.length === 0}
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-secondary disabled:opacity-60"
          >
            <Download className="h-4 w-4" />
            ייצוא לאקסל
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          שגיאה בטעינה: {error}
        </div>
      )}

      {loading ? (
        <p className="text-muted-foreground">טוען...</p>
      ) : summary.length === 0 ? (
        <p className="text-muted-foreground">אין שיעורי מילוי בחודש הזה.</p>
      ) : (
        <div className="rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-secondary text-right">
              <tr>
                <th className="p-2">ממלאת מקום</th>
                <th className="p-2">סוג</th>
                <th className="p-2">שיעורים שאושרו</th>
                <th className="w-1/3 p-2" aria-hidden="true"></th>
                <th className="p-2">ימים</th>
                <th className="p-2">ממתינים לאישור</th>
              </tr>
            </thead>
            <tbody>
              {summary.map((s) => (
                <tr key={s.name} className="border-t">
                  <td className="p-2 font-medium">{s.name}</td>
                  <td className="p-2">{s.type === "external" ? "חיצונית" : "פנימית"}</td>
                  <td className="p-2 font-medium">{s.approved}</td>
                  <td className="p-2">
                    <div className="h-2 rounded-full bg-secondary" aria-hidden="true">
                      <div
                        className="h-2 rounded-full bg-primary"
                        style={{ width: `${(s.approved / maxApproved) * 100}%` }}
                      />
                    </div>
                  </td>
                  <td className="p-2">{s.days.size}</td>
                  <td className="p-2 text-muted-foreground">{s.pending || "—"}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t bg-secondary/50 font-medium">
              <tr>
                <td className="p-2" colSpan={2}>
                  סך הכול
                </td>
                <td className="p-2">{totalApproved}</td>
                <td className="p-2"></td>
                <td className="p-2"></td>
                <td className="p-2">{totalPending || "—"}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
