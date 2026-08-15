import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ScheduleEditor } from "@/components/schedule-editor";
import { requireAdmin } from "@/lib/auth-guards";
import { fetchScheduleForTeacher, saveScheduleForTeacher, buildEmptyGrid, emptyScheduleSlot, type ScheduleSlot } from "@/lib/schedule";

export const Route = createFileRoute("/_authenticated/admin/teachers/$teacherId/schedule")({
  beforeLoad: () => requireAdmin(),
  component: AdminTeacherSchedulePage,
});

function AdminTeacherSchedulePage() {
  const { teacherId } = Route.useParams();
  const [teacherName, setTeacherName] = useState("");
  const [scheduleLocked, setScheduleLocked] = useState(false);
  const [grid, setGrid] = useState<Record<string, ScheduleSlot>>(() => buildEmptyGrid());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: teacher, error } = await supabase
        .from("teachers")
        .select("full_name, schedule_locked")
        .eq("id", teacherId)
        .maybeSingle();
      if (error || !teacher) {
        setMessage("מורה לא נמצאה.");
        setLoading(false);
        return;
      }
      setTeacherName(teacher.full_name);
      setScheduleLocked(teacher.schedule_locked);
      try {
        setGrid(await fetchScheduleForTeacher(teacherId));
      } catch (e) {
        setMessage("שגיאה בטעינה: " + (e instanceof Error ? e.message : String(e)));
      }
      setLoading(false);
    })();
  }, [teacherId]);

  function updateSlot(key: string, patch: Partial<ScheduleSlot>) {
    setGrid((g) => ({
      ...g,
      [key]: { ...(g[key] ?? emptyScheduleSlot()), ...patch },
    }));
  }

  async function save(lockAfter: boolean) {
    setSaving(true);
    setMessage(null);
    const result = await saveScheduleForTeacher(teacherId, grid, { lockAfter });
    if (result.error) {
      setMessage("שגיאה בשמירה: " + result.error);
    } else {
      if (lockAfter) setScheduleLocked(true);
      setMessage(lockAfter ? "המערכת נשמרה ונעולה." : "נשמר.");
    }
    setSaving(false);
  }

  async function unlockForTeacher() {
    if (!confirm("לפתוח את המערכת של המורה לעריכה על ידה?")) return;
    const { error } = await supabase
      .from("teachers")
      .update({ schedule_locked: false })
      .eq("id", teacherId);
    if (error) {
      setMessage("שגיאה: " + error.message);
      return;
    }
    setScheduleLocked(false);
    setMessage("המערכת נפתחה לעריכה על ידי המורה.");
  }

  if (loading) return <p className="text-muted-foreground">טוען...</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link
            to="/admin/teachers"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ← חזרה לרשימת מורות
          </Link>
          <h1 className="mt-1 text-2xl font-bold">מערכת שבועית — {teacherName}</h1>
          <p className="text-sm text-muted-foreground">
            {scheduleLocked ? "המערכת נעולה למורה." : "המערכת פתוחה לעריכה על ידי המורה."}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button
            onClick={() => save(false)}
            disabled={saving}
            className="rounded-md border px-3 py-1.5 text-sm hover:bg-secondary disabled:opacity-60"
          >
            שמירה
          </button>
          <button
            onClick={() => save(true)}
            disabled={saving}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            שמירה ונעילה
          </button>
          {scheduleLocked && (
            <button
              onClick={unlockForTeacher}
              className="rounded-md border px-3 py-1.5 text-sm hover:bg-secondary"
            >
              פתיחה למורה
            </button>
          )}
        </div>
      </div>
      {message && <div className="rounded-md bg-accent px-3 py-2 text-sm">{message}</div>}
      <ScheduleEditor grid={grid} onUpdateSlot={updateSlot} />
    </div>
  );
}
