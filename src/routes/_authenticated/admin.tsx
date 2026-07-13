import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { notifyTeacherDecision } from "@/lib/email.functions";
import { claimAdminIfNone } from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminDashboard,
});

type PendingRow = {
  id: string;
  absence_date: string;
  status: string;
  admin_note: string | null;
  teachers: { full_name: string; email: string } | null;
  absence_lessons: {
    lesson_number: number;
    subject: string | null;
    class_name: string | null;
    substitute_teacher_id: string | null;
    teachers: { full_name: string } | null;
  }[];
};

function AdminDashboard() {
  const router = useRouter();
  const [rows, setRows] = useState<PendingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const notifyFn = useServerFn(notifyTeacherDecision);
  const claimFn = useServerFn(claimAdminIfNone);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("absence_requests")
      .select(
        "id, absence_date, status, admin_note, teachers:teacher_id(full_name, email), absence_lessons(lesson_number, subject, class_name, substitute_teacher_id, teachers:substitute_teacher_id(full_name))",
      )
      .eq("status", "pending")
      .order("absence_date");
    setRows((data as unknown as PendingRow[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    // check admin, auto-claim if none exist yet
    (async () => {
      const { data: userRes } = await supabase.auth.getUser();
      if (!userRes.user) return;
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userRes.user.id);
      const isAdmin = roles?.some((r) => r.role === "admin");
      if (!isAdmin) {
        try {
          const res = await claimFn();
          if (!res.claimed) {
            router.navigate({ to: "/" });
            return;
          }
        } catch {
          router.navigate({ to: "/" });
          return;
        }
      }
      load();
    })();
  }, []);

  async function decide(row: PendingRow, approved: boolean) {
    const status = approved ? "approved" : "rejected";
    const note = notes[row.id] ?? null;
    const { error } = await supabase
      .from("absence_requests")
      .update({ status, decided_at: new Date().toISOString(), admin_note: note })
      .eq("id", row.id);
    if (error) {
      alert("שגיאה: " + error.message);
      return;
    }
    if (!approved) {
      // Remove assignments so substitutes are freed
      const lessonIds = row.absence_lessons.map((l) => l);
      // best-effort: delete via cascade would happen only if we deleted the request; keep request but drop assignments
      await supabase
        .from("substitute_assignments")
        .delete()
        .in(
          "absence_lesson_id",
          row.absence_lessons.map((l) => (l as any).id).filter(Boolean),
        );
      void lessonIds;
    }
    try {
      if (row.teachers?.email) {
        await notifyFn({
          data: {
            teacherEmail: row.teachers.email,
            absenceDate: row.absence_date,
            approved,
            note: note ?? undefined,
          },
        });
      }
    } catch {
      /* ignore */
    }
    load();
  }

  if (loading) return <p className="text-muted-foreground">טוען...</p>;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">בקשות ממתינות לאישור</h1>
      {rows.length === 0 ? (
        <p className="text-muted-foreground">אין בקשות ממתינות.</p>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <div key={r.id} className="rounded-lg border bg-card p-4">
              <div className="flex items-center justify-between border-b pb-2">
                <div>
                  <div className="font-semibold">{r.teachers?.full_name}</div>
                  <div className="text-sm text-muted-foreground">{r.absence_date}</div>
                </div>
              </div>
              <table className="mt-2 w-full text-sm">
                <thead>
                  <tr className="text-right text-muted-foreground">
                    <th className="py-1">שיעור</th>
                    <th className="py-1">מקצוע / כיתה</th>
                    <th className="py-1">ממלאת מקום</th>
                  </tr>
                </thead>
                <tbody>
                  {r.absence_lessons
                    .sort((a, b) => a.lesson_number - b.lesson_number)
                    .map((l) => (
                      <tr key={l.lesson_number} className="border-t">
                        <td className="py-1.5">{l.lesson_number}</td>
                        <td className="py-1.5">
                          {l.subject} · {l.class_name}
                        </td>
                        <td className="py-1.5 font-medium">{l.teachers?.full_name ?? "—"}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
              <div className="mt-3 flex items-center gap-2">
                <input
                  placeholder="הערה (אופציונלי)"
                  value={notes[r.id] ?? ""}
                  onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))}
                  className="flex-1 rounded-md border bg-background px-3 py-1.5 text-sm"
                />
                <button
                  onClick={() => decide(r, true)}
                  className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  אישור
                </button>
                <button
                  onClick={() => decide(r, false)}
                  className="rounded-md border border-destructive px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10"
                >
                  דחייה
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}