import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ScheduleEditor } from "@/components/schedule-editor";
import { ScheduleView } from "@/components/schedule-view";
import { fetchScheduleForTeacher, saveScheduleForTeacher, buildEmptyGrid, emptyScheduleSlot, isScheduleEmpty, type ScheduleSlot } from "@/lib/schedule";

export const Route = createFileRoute("/_authenticated/schedule")({
  component: SchedulePage,
});

function SchedulePage() {
  const [teacherId, setTeacherId] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [grid, setGrid] = useState<Record<string, ScheduleSlot>>(() => buildEmptyGrid());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: userRes } = await supabase.auth.getUser();
      if (!userRes.user) return;
      const { data: teacher } = await supabase
        .from("teachers")
        .select("id, schedule_locked")
        .eq("user_id", userRes.user.id)
        .maybeSingle();
      if (!teacher) {
        setLoading(false);
        return;
      }
      setTeacherId(teacher.id);
      setLocked(teacher.schedule_locked);
      try {
        const loaded = await fetchScheduleForTeacher(teacher.id);
        setGrid(loaded);
        // A schedule nobody filled in yet opens straight in the editor.
        setEditing(!teacher.schedule_locked && isScheduleEmpty(loaded));
      } catch (e) {
        setMessage("שגיאה בטעינה: " + (e instanceof Error ? e.message : String(e)));
      }
      setLoading(false);
    })();
  }, []);

  function updateSlot(key: string, patch: Partial<ScheduleSlot>) {
    setDirty(true);
    setGrid((g) => ({
      ...g,
      [key]: { ...(g[key] ?? emptyScheduleSlot()), ...patch },
    }));
  }

  async function saveAll(lockAfter: boolean) {
    if (!teacherId) return;
    setSaving(true);
    setMessage(null);
    const result = await saveScheduleForTeacher(teacherId, grid, { lockAfter });
    if (result.error) {
      setMessage("שגיאה בשמירה: " + result.error);
      setSaving(false);
      return;
    }
    if (lockAfter) setLocked(true);
    setEditing(false);
    setDirty(false);
    setMessage(lockAfter ? "המערכת נשמרה ונעולה." : "נשמר.");
    setSaving(false);
  }

  async function finishEditing() {
    if (dirty && !confirm("יש שינויים שלא נשמרו. לצאת בלי לשמור?")) return;
    if (teacherId) {
      try {
        setGrid(await fetchScheduleForTeacher(teacherId));
      } catch (e) {
        setMessage("שגיאה בטעינה: " + (e instanceof Error ? e.message : String(e)));
      }
    }
    setDirty(false);
    setEditing(false);
  }

  if (loading) return <p className="text-muted-foreground">טוען...</p>;
  if (!teacherId)
    return (
      <div className="rounded-md border bg-card p-6">
        <p>לא נמצא רישום מורה עבור המשתמש שלך. פני למנהלת.</p>
      </div>
    );

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">מערכת שבועית</h1>
          <p className="text-sm text-muted-foreground">
            {locked
              ? "המערכת שלך נעולה. לעדכון פני למנהלת."
              : editing
                ? "מלאי את המערכת השבועית. לאחר שמירה סופית לא תוכלי לערוך יותר."
                : "המערכת פתוחה לעריכה. לאחר שמירה סופית היא תינעל."}
          </p>
        </div>
        {!locked && !editing && (
          <button
            onClick={() => setEditing(true)}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            עריכת המערכת
          </button>
        )}
        {!locked && editing && (
          <div className="flex gap-2">
            <button
              onClick={finishEditing}
              disabled={saving}
              className="rounded-md border px-3 py-1.5 text-sm hover:bg-secondary disabled:opacity-60"
            >
              ביטול
            </button>
            <button
              onClick={() => saveAll(false)}
              disabled={saving}
              className="rounded-md border px-3 py-1.5 text-sm hover:bg-secondary disabled:opacity-60"
            >
              שמירה
            </button>
            <button
              onClick={() => saveAll(true)}
              disabled={saving}
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              שמירה סופית ונעילה
            </button>
          </div>
        )}
      </div>
      {message && <div className="rounded-md bg-accent px-3 py-2 text-sm">{message}</div>}
      {editing ? (
        <ScheduleEditor grid={grid} onUpdateSlot={updateSlot} />
      ) : (
        <ScheduleView grid={grid} />
      )}
    </div>
  );
}
