import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/my-requests")({
  component: MyRequestsPage,
});

type Row = {
  id: string;
  absence_date: string;
  status: "pending" | "approved" | "rejected";
  admin_note: string | null;
  decided_at: string | null;
  absence_lessons: { lesson_number: number; substitute_teacher_id: string | null; teachers?: { full_name: string } | null }[];
};

const STATUS: Record<string, { label: string; className: string }> = {
  pending: { label: "ממתין לאישור", className: "bg-yellow-100 text-yellow-800" },
  approved: { label: "אושר", className: "bg-green-100 text-green-800" },
  rejected: { label: "נדחה", className: "bg-red-100 text-red-800" },
};

function MyRequestsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: userRes } = await supabase.auth.getUser();
      if (!userRes.user) return;
      const { data: teacher } = await supabase
        .from("teachers")
        .select("id")
        .eq("user_id", userRes.user.id)
        .maybeSingle();
      if (!teacher) {
        setLoading(false);
        return;
      }
      const { data } = await supabase
        .from("absence_requests")
        .select(
          "id, absence_date, status, admin_note, decided_at, absence_lessons(lesson_number, substitute_teacher_id, teachers:substitute_teacher_id(full_name))",
        )
        .eq("teacher_id", teacher.id)
        .order("absence_date", { ascending: false });
      setRows((data as unknown as Row[]) ?? []);
      setLoading(false);
    })();
  }, []);

  if (loading) return <p className="text-muted-foreground">טוען...</p>;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">הבקשות שלי</h1>
      {rows.length === 0 ? (
        <p className="text-muted-foreground">לא נשלחו בקשות עדיין.</p>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <div key={r.id} className="rounded-lg border bg-card p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-lg font-semibold">{r.absence_date}</div>
                  <div className="text-sm text-muted-foreground">
                    {r.absence_lessons.length} שיעורים
                  </div>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS[r.status].className}`}>
                  {STATUS[r.status].label}
                </span>
              </div>
              <table className="mt-3 w-full text-sm">
                <tbody>
                  {r.absence_lessons
                    .sort((a, b) => a.lesson_number - b.lesson_number)
                    .map((l) => (
                      <tr key={l.lesson_number} className="border-t">
                        <td className="py-1.5">שיעור {l.lesson_number}</td>
                        <td className="py-1.5">{l.teachers?.full_name ?? "—"}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
              {r.admin_note && (
                <div className="mt-2 rounded-md bg-accent px-2 py-1 text-sm">הערה: {r.admin_note}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}