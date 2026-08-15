import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { requireAdmin } from "@/lib/auth-guards";

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
    subject: string | null;
    class_name: string | null;
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
          "id, absence_date, status, decided_at, teachers:teacher_id(full_name), absence_lessons(lesson_number, subject, class_name, teachers:substitute_teacher_id(full_name))",
        )
        .order("absence_date", { ascending: false });
      setRows((data as unknown as Row[]) ?? []);
      setLoading(false);
    })();
  }, []);

  if (loading) return <p className="text-muted-foreground">טוען...</p>;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">היסטוריית בקשות</h1>
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
                    {r.decided_at ? ` · הוחלט: ${new Date(r.decided_at).toLocaleDateString("he-IL")}` : ""}
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
                      <tr key={l.lesson_number} className="border-t">
                        <td className="py-1.5">שיעור {l.lesson_number}</td>
                        <td className="py-1.5">
                          {l.subject} · {l.class_name}
                        </td>
                        <td className="py-1.5">{l.teachers?.full_name ?? "—"}</td>
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
