import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { notifyTeacherDecision } from "@/lib/email.functions";
import { claimAdminIfNone, decideAbsenceRequest } from "@/lib/admin.functions";
import { requireAdmin } from "@/lib/auth-guards";

export const Route = createFileRoute("/_authenticated/admin/")({
  beforeLoad: () => requireAdmin({ allowBootstrap: true }),
  component: AdminDashboard,
});

type PendingRow = {
  id: string;
  absence_date: string;
  status: string;
  admin_note: string | null;
  teachers: { full_name: string; email: string } | null;
  absence_lessons: {
    id: string;
    lesson_number: number;
    subject: string | null;
    class_name: string | null;
    substitute_teacher_id: string | null;
    teachers: { full_name: string } | null;
  }[];
};

// The admin's choice for one lesson, kept locally until she sends the whole decision.
type LessonDecision = { approved: boolean; reason: string };

function AdminDashboard() {
  const { bootstrap } = Route.useRouteContext();
  const [rows, setRows] = useState<PendingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [decisions, setDecisions] = useState<Record<string, LessonDecision>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const notifyFn = useServerFn(notifyTeacherDecision);
  const claimFn = useServerFn(claimAdminIfNone);
  const decideFn = useServerFn(decideAbsenceRequest);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("absence_requests")
      .select(
        "id, absence_date, status, admin_note, teachers:teacher_id(full_name, email), absence_lessons(id, lesson_number, subject, class_name, substitute_teacher_id, teachers:substitute_teacher_id(full_name))",
      )
      .eq("status", "pending")
      .order("absence_date");
    setRows((data as unknown as PendingRow[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    (async () => {
      if (bootstrap) {
        try {
          await claimFn();
        } catch {
          return;
        }
      }
      load();
    })();
  }, [bootstrap]);

  function setDecision(lessonId: string, patch: Partial<LessonDecision> & { approved: boolean }) {
    setDecisions((d) => ({
      ...d,
      [lessonId]: { approved: patch.approved, reason: patch.reason ?? d[lessonId]?.reason ?? "" },
    }));
  }

  async function send(row: PendingRow, all: Record<string, LessonDecision>) {
    setError(null);
    setSendingId(row.id);
    try {
      const note = notes[row.id]?.trim() || undefined;
      const res = await decideFn({
        data: {
          requestId: row.id,
          note,
          decisions: row.absence_lessons.map((l) => ({
            lessonId: l.id,
            approved: all[l.id].approved,
            reason: all[l.id].approved ? undefined : all[l.id].reason.trim(),
          })),
        },
      });
      try {
        if (res.teacherEmail) {
          await notifyFn({
            data: {
              teacherEmail: res.teacherEmail,
              absenceDate: res.absenceDate,
              note,
              lessons: res.lessons,
            },
          });
        }
      } catch {
        /* the decision is saved; the email is best-effort */
      }
      await load();
    } catch (err) {
      setError("שגיאה: " + (err instanceof Error ? err.message : String(err)));
    }
    setSendingId(null);
  }

  function approveAll(row: PendingRow) {
    const all: Record<string, LessonDecision> = {};
    for (const l of row.absence_lessons) all[l.id] = { approved: true, reason: "" };
    setDecisions((d) => ({ ...d, ...all }));
    send(row, all);
  }

  if (loading) return <p className="text-muted-foreground">טוען...</p>;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">בקשות ממתינות לאישור</h1>
      {error && (
        <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}
      {rows.length === 0 ? (
        <p className="text-muted-foreground">אין בקשות ממתינות.</p>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => {
            const lessons = [...r.absence_lessons].sort(
              (a, b) => a.lesson_number - b.lesson_number,
            );
            const decidedCount = lessons.filter((l) => decisions[l.id]).length;
            const missingReason = lessons.some(
              (l) => decisions[l.id] && !decisions[l.id].approved && !decisions[l.id].reason.trim(),
            );
            const ready = decidedCount === lessons.length && !missingReason;
            const sending = sendingId === r.id;
            return (
              <div key={r.id} className="rounded-lg border bg-card p-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2">
                  <div>
                    <div className="font-semibold">{r.teachers?.full_name}</div>
                    <div className="text-sm text-muted-foreground">{r.absence_date}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => approveAll(r)}
                    disabled={sending}
                    className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    אישור הכול
                  </button>
                </div>
                <table className="mt-2 w-full text-sm">
                  <thead>
                    <tr className="text-right text-muted-foreground">
                      <th className="py-1">שיעור</th>
                      <th className="py-1">מקצוע / כיתה</th>
                      <th className="py-1">ממלאת מקום</th>
                      <th className="py-1">החלטה</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lessons.map((l) => {
                      const d = decisions[l.id];
                      return (
                        <tr key={l.id} className="border-t align-top">
                          <td className="py-2">{l.lesson_number}</td>
                          <td className="py-2">
                            {l.subject} · {l.class_name}
                          </td>
                          <td className="py-2 font-medium">{l.teachers?.full_name ?? "—"}</td>
                          <td className="py-2">
                            <div className="flex gap-1">
                              <button
                                type="button"
                                onClick={() => setDecision(l.id, { approved: true })}
                                className={`rounded-md border px-2.5 py-1 text-xs font-medium ${
                                  d?.approved
                                    ? "border-green-600 bg-green-600 text-white"
                                    : "hover:bg-secondary"
                                }`}
                              >
                                מאושר
                              </button>
                              <button
                                type="button"
                                onClick={() => setDecision(l.id, { approved: false })}
                                className={`rounded-md border px-2.5 py-1 text-xs font-medium ${
                                  d && !d.approved
                                    ? "border-destructive bg-destructive text-destructive-foreground"
                                    : "border-destructive text-destructive hover:bg-destructive/10"
                                }`}
                              >
                                נדחה
                              </button>
                            </div>
                            {d && !d.approved && (
                              <input
                                autoFocus
                                placeholder="סיבת הדחייה (חובה)"
                                value={d.reason}
                                onChange={(e) =>
                                  setDecision(l.id, { approved: false, reason: e.target.value })
                                }
                                className="mt-1.5 w-full min-w-[180px] rounded-md border bg-background px-2 py-1 text-xs"
                              />
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <input
                    placeholder="הערה למורה (אופציונלי)"
                    value={notes[r.id] ?? ""}
                    onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))}
                    className="min-w-[200px] flex-1 rounded-md border bg-background px-3 py-1.5 text-sm"
                  />
                  <span className="text-xs text-muted-foreground">
                    הוחלט על {decidedCount} מתוך {lessons.length} שיעורים
                  </span>
                  <button
                    type="button"
                    onClick={() => send(r, decisions)}
                    disabled={!ready || sending}
                    className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    {sending ? "שולחת..." : "שליחת ההחלטה"}
                  </button>
                </div>
                {missingReason && (
                  <p className="mt-1 text-xs text-destructive">יש לכתוב סיבה לכל שיעור שנדחה.</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
