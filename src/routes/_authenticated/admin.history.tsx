import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Download } from "lucide-react";
import { requireAdmin } from "@/lib/auth-guards";
import { downloadXlsx, todayStamp } from "@/lib/export-xlsx";
import { formatClassLabel } from "@/lib/schedule";

export const Route = createFileRoute("/_authenticated/admin/history")({
  beforeLoad: () => requireAdmin(),
  component: AdminHistory,
});

type Row = {
  id: string;
  absence_date: string;
  status: "pending" | "approved" | "rejected";
  decided_at: string | null;
  teachers: { full_name: string } | null;
  absence_lessons: {
    lesson_number: number;
    status: "pending" | "approved" | "rejected";
    admin_note: string | null;
    subject: string | null;
    class_name: string | null;
    grade_level: string | null;
    teachers: { full_name: string } | null;
  }[];
};

const STATUS_LABEL: Record<string, string> = {
  pending: "ממתין",
  approved: "אושר",
  rejected: "נדחה",
};

function AdminHistory() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("absence_requests")
        .select(
          "id, absence_date, status, decided_at, teachers:teacher_id(full_name), absence_lessons(lesson_number, status, admin_note, subject, class_name, grade_level, teachers:substitute_teacher_id(full_name))",
        )
        .order("absence_date", { ascending: false });
      setRows((data as unknown as Row[]) ?? []);
      setLoading(false);
    })();
  }, []);

  // One spreadsheet row per lesson, so it can be filtered and totalled in Excel.
  function exportToExcel() {
    const data = rows.flatMap((r) =>
      [...r.absence_lessons]
        .sort((a, b) => a.lesson_number - b.lesson_number)
        .map((l) => ({
          תאריך: r.absence_date,
          "מורה נעדרת": r.teachers?.full_name ?? "",
          שיעור: l.lesson_number,
          מקצוע: l.subject ?? "",
          כיתה: formatClassLabel(l.grade_level ?? "", l.class_name ?? ""),
          "ממלאת מקום": l.teachers?.full_name ?? "",
          החלטה: STATUS_LABEL[l.status],
          "סיבת הדחייה": l.status === "rejected" ? (l.admin_note ?? "") : "",
          "תאריך החלטה": r.decided_at ? new Date(r.decided_at).toLocaleDateString("he-IL") : "",
        })),
    );
    downloadXlsx(`history-${todayStamp()}.xlsx`, "היסטוריה", data);
  }

  if (loading) return <p className="text-muted-foreground">טוען...</p>;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">היסטוריית בקשות</h1>
        {rows.length > 0 && (
          <button
            type="button"
            onClick={exportToExcel}
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-secondary"
          >
            <Download className="h-4 w-4" />
            ייצוא לאקסל
          </button>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="text-muted-foreground">אין בקשות.</p>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <div key={r.id} className="rounded-lg border bg-card p-4">
              <div className="flex items-center justify-between border-b pb-2">
                <div>
                  <div className="font-semibold">{r.teachers?.full_name}</div>
                  <div className="text-sm text-muted-foreground">
                    {r.absence_date}
                    {r.decided_at
                      ? ` · הוחלט: ${new Date(r.decided_at).toLocaleDateString("he-IL")}`
                      : ""}
                  </div>
                </div>
                <span className="rounded-full bg-secondary px-3 py-1 text-xs font-medium">
                  {STATUS_LABEL[r.status]}
                </span>
              </div>
              <table className="mt-2 w-full text-sm">
                <tbody>
                  {r.absence_lessons
                    .sort((a, b) => a.lesson_number - b.lesson_number)
                    .map((l) => (
                      <tr key={l.lesson_number} className="border-t align-top">
                        <td className="py-1.5">שיעור {l.lesson_number}</td>
                        <td className="py-1.5">
                          {l.subject} · {l.class_name}
                        </td>
                        <td className="py-1.5">{l.teachers?.full_name ?? "—"}</td>
                        <td className="py-1.5">
                          {r.status !== "pending" && STATUS_LABEL[l.status]}
                          {l.status === "rejected" && l.admin_note && (
                            <div className="text-xs text-muted-foreground">
                              סיבה: {l.admin_note}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
