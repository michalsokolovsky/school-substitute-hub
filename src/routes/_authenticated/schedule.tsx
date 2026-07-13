import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/schedule")({
  component: SchedulePage,
});

const DAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי"];
const LESSONS = [1, 2, 3, 4, 5, 6, 7, 8];
const STATUS_LABEL: Record<string, string> = {
  teaching: "מלמדת",
  free: "חלון",
  available: "פנויה למילוי",
  unavailable: "לא זמינה",
};

type Slot = {
  status: "teaching" | "free" | "available" | "unavailable";
  subject: string;
  class_name: string;
  grade_level: string;
  ability_group: string;
};

function emptySlot(): Slot {
  return { status: "free", subject: "", class_name: "", grade_level: "", ability_group: "" };
}

function isMathOrEnglish(subject: string) {
  const s = subject.trim().toLowerCase();
  return ["אנגלית", "מתמטיקה", "english", "math"].includes(s);
}

function SchedulePage() {
  const [teacherId, setTeacherId] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [grid, setGrid] = useState<Record<string, Slot>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

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
      const { data: slots } = await supabase
        .from("schedule_slots")
        .select("*")
        .eq("teacher_id", teacher.id);
      const g: Record<string, Slot> = {};
      DAYS.forEach((_, d) => LESSONS.forEach((l) => (g[`${d}-${l}`] = emptySlot())));
      slots?.forEach((s) => {
        g[`${s.day}-${s.lesson_number}`] = {
          status: s.status,
          subject: s.subject ?? "",
          class_name: s.class_name ?? "",
          grade_level: s.grade_level ?? "",
          ability_group: s.ability_group ?? "",
        };
      });
      setGrid(g);
      setLoading(false);
    })();
  }, []);

  function updateSlot(key: string, patch: Partial<Slot>) {
    setGrid((g) => ({ ...g, [key]: { ...g[key], ...patch } }));
  }

  async function saveAll(lockAfter: boolean) {
    if (!teacherId) return;
    setSaving(true);
    setMessage(null);
    const rows = Object.entries(grid).map(([key, s]) => {
      const [day, lesson] = key.split("-").map(Number);
      return {
        teacher_id: teacherId,
        day,
        lesson_number: lesson,
        status: s.status,
        subject: s.status === "teaching" ? s.subject || null : null,
        class_name: s.status === "teaching" ? s.class_name || null : null,
        grade_level: s.status === "teaching" ? s.grade_level || null : null,
        ability_group:
          s.status === "teaching" && isMathOrEnglish(s.subject) ? s.ability_group || null : null,
      };
    });
    const { error } = await supabase
      .from("schedule_slots")
      .upsert(rows, { onConflict: "teacher_id,day,lesson_number" });
    if (error) {
      setMessage("שגיאה בשמירה: " + error.message);
      setSaving(false);
      return;
    }
    if (lockAfter) {
      const { error: e2 } = await supabase
        .from("teachers")
        .update({ schedule_locked: true })
        .eq("id", teacherId);
      if (e2) {
        setMessage("שגיאה בנעילה: " + e2.message);
        setSaving(false);
        return;
      }
      setLocked(true);
    }
    setMessage(lockAfter ? "המערכת נשמרה ונעולה." : "נשמר.");
    setSaving(false);
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
              : "מלאי את המערכת השבועית. לאחר שמירה סופית לא תוכלי לערוך יותר."}
          </p>
        </div>
        {!locked && (
          <div className="flex gap-2">
            <button
              onClick={() => saveAll(false)}
              disabled={saving}
              className="rounded-md border px-3 py-1.5 text-sm hover:bg-secondary disabled:opacity-60"
            >
              שמירת טיוטה
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

      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-secondary">
            <tr>
              <th className="border p-2 font-medium">שיעור</th>
              {DAYS.map((d) => (
                <th key={d} className="border p-2 font-medium">
                  {d}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {LESSONS.map((l) => (
              <tr key={l}>
                <td className="border bg-secondary/50 p-2 text-center font-medium">{l}</td>
                {DAYS.map((_, d) => {
                  const key = `${d}-${l}`;
                  const slot = grid[key];
                  return (
                    <td key={key} className="border p-2 align-top">
                      <select
                        disabled={locked}
                        value={slot.status}
                        onChange={(e) => updateSlot(key, { status: e.target.value as Slot["status"] })}
                        className="w-full rounded border bg-background px-2 py-1 text-xs"
                      >
                        {Object.entries(STATUS_LABEL).map(([v, label]) => (
                          <option key={v} value={v}>
                            {label}
                          </option>
                        ))}
                      </select>
                      {slot.status === "teaching" && (
                        <div className="mt-1 space-y-1">
                          <input
                            disabled={locked}
                            placeholder="מקצוע"
                            value={slot.subject}
                            onChange={(e) => updateSlot(key, { subject: e.target.value })}
                            className="w-full rounded border bg-background px-2 py-1 text-xs"
                          />
                          <input
                            disabled={locked}
                            placeholder="כיתה"
                            value={slot.class_name}
                            onChange={(e) => updateSlot(key, { class_name: e.target.value })}
                            className="w-full rounded border bg-background px-2 py-1 text-xs"
                          />
                          <input
                            disabled={locked}
                            placeholder="שכבה"
                            value={slot.grade_level}
                            onChange={(e) => updateSlot(key, { grade_level: e.target.value })}
                            className="w-full rounded border bg-background px-2 py-1 text-xs"
                          />
                          {isMathOrEnglish(slot.subject) && (
                            <input
                              disabled={locked}
                              placeholder="קבוצת רמה"
                              value={slot.ability_group}
                              onChange={(e) => updateSlot(key, { ability_group: e.target.value })}
                              className="w-full rounded border bg-background px-2 py-1 text-xs"
                            />
                          )}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}