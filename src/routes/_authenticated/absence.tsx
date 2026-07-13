import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { scoreCandidate, type CandidateSlot, type MissedLesson } from "@/lib/scoring";

export const Route = createFileRoute("/_authenticated/absence")({
  component: AbsencePage,
});

type TeacherRow = {
  id: string;
  full_name: string;
  phone: string | null;
  type: "regular" | "external";
};

function AbsencePage() {
  const router = useRouter();
  const [teacherId, setTeacherId] = useState<string | null>(null);
  const [teacherName, setTeacherName] = useState("");
  const [absenceDate, setAbsenceDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [mySlots, setMySlots] = useState<Record<number, MissedLesson & { day: number; status: string }>>({});
  const [selectedLessons, setSelectedLessons] = useState<Set<number>>(new Set());
  const [step, setStep] = useState<"pick" | "match" | "summary">("pick");
  const [candidates, setCandidates] = useState<Record<number, CandidateSlot[]>>({});
  const [chosen, setChosen] = useState<Record<number, CandidateSlot>>({});
  const [searchType, setSearchType] = useState<"all" | "regular" | "external">("all");
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const dayOfWeek = useMemo(() => new Date(absenceDate).getDay(), [absenceDate]); // 0=Sun..6=Sat

  useEffect(() => {
    (async () => {
      const { data: userRes } = await supabase.auth.getUser();
      if (!userRes.user) return;
      const { data: teacher } = await supabase
        .from("teachers")
        .select("id, full_name")
        .eq("user_id", userRes.user.id)
        .maybeSingle();
      if (teacher) {
        setTeacherId(teacher.id);
        setTeacherName(teacher.full_name);
      }
    })();
  }, []);

  useEffect(() => {
    if (!teacherId) return;
    if (dayOfWeek > 5) {
      setMySlots({});
      return;
    }
    supabase
      .from("schedule_slots")
      .select("*")
      .eq("teacher_id", teacherId)
      .eq("day", dayOfWeek)
      .then(({ data }) => {
        const m: Record<number, MissedLesson & { day: number; status: string }> = {};
        data?.forEach((s) => {
          m[s.lesson_number] = {
            day: s.day,
            status: s.status,
            lesson_number: s.lesson_number,
            subject: s.subject,
            class_name: s.class_name,
            grade_level: s.grade_level,
            ability_group: s.ability_group,
          };
        });
        setMySlots(m);
      });
  }, [teacherId, dayOfWeek]);

  function toggleLesson(l: number) {
    setSelectedLessons((s) => {
      const n = new Set(s);
      if (n.has(l)) n.delete(l);
      else n.add(l);
      return n;
    });
  }

  async function findCandidates() {
    if (!teacherId || selectedLessons.size === 0) return;
    setMessage(null);
    const lessons = [...selectedLessons].sort((a, b) => a - b);

    // Fetch all teachers except self
    let teachersQuery = supabase.from("teachers").select("id, full_name, phone, type").neq("id", teacherId);
    if (searchType !== "all") teachersQuery = teachersQuery.eq("type", searchType);
    const { data: teachersData } = await teachersQuery;
    const teachers = (teachersData ?? []) as TeacherRow[];
    const teacherIds = teachers.map((t) => t.id);
    if (teacherIds.length === 0) {
      setCandidates({});
      setStep("match");
      return;
    }

    // Fetch their availability slots for this day
    const { data: allSlots } = await supabase
      .from("schedule_slots")
      .select("teacher_id, lesson_number, status, subject, class_name, grade_level, ability_group")
      .in("teacher_id", teacherIds)
      .eq("day", dayOfWeek)
      .eq("status", "available");

    // Fetch existing substitute assignments for this date
    const { data: busy } = await supabase
      .from("substitute_assignments")
      .select("substitute_teacher_id, lesson_number")
      .eq("assignment_date", absenceDate)
      .in("substitute_teacher_id", teacherIds);
    const busySet = new Set(busy?.map((b) => `${b.substitute_teacher_id}-${b.lesson_number}`) ?? []);

    // Load balancing: assignments in last 30 days
    const since = new Date();
    since.setDate(since.getDate() - 30);
    const { data: recent } = await supabase
      .from("substitute_assignments")
      .select("substitute_teacher_id")
      .in("substitute_teacher_id", teacherIds)
      .gte("assignment_date", since.toISOString().slice(0, 10));
    const recentCount = new Map<string, number>();
    recent?.forEach((r) => recentCount.set(r.substitute_teacher_id, (recentCount.get(r.substitute_teacher_id) ?? 0) + 1));

    // Build lookup: teacher -> lesson -> slot (only for available slots)
    const availByTeacher = new Map<string, Map<number, (typeof allSlots)[number]>>();
    allSlots?.forEach((s) => {
      let m = availByTeacher.get(s.teacher_id);
      if (!m) {
        m = new Map();
        availByTeacher.set(s.teacher_id, m);
      }
      m.set(s.lesson_number, s);
    });

    const teacherMap = new Map(teachers.map((t) => [t.id, t]));
    const result: Record<number, CandidateSlot[]> = {};

    for (const lesson of lessons) {
      const missed = mySlots[lesson];
      if (!missed) continue;
      const cands: CandidateSlot[] = [];
      for (const [tid, avail] of availByTeacher.entries()) {
        const slot = avail.get(lesson);
        if (!slot) continue;
        if (busySet.has(`${tid}-${lesson}`)) continue;
        const t = teacherMap.get(tid);
        if (!t) continue;
        // consecutive coverage among selected lessons
        let consec = 0;
        for (const l of lessons) {
          if (avail.has(l) && !busySet.has(`${tid}-${l}`)) consec++;
        }
        cands.push({
          teacher_id: tid,
          full_name: t.full_name,
          phone: t.phone,
          type: t.type,
          subject: slot.subject,
          class_name: slot.class_name,
          grade_level: slot.grade_level,
          ability_group: slot.ability_group,
          lesson_number: lesson,
          recent_assignments: recentCount.get(tid) ?? 0,
          consecutive_coverage: consec,
        });
      }
      cands.sort((a, b) => scoreCandidate(b, missed).total - scoreCandidate(a, missed).total);
      result[lesson] = cands;
    }
    setCandidates(result);
    setChosen({});
    setStep("match");
  }

  async function submitRequest() {
    if (!teacherId) return;
    const lessons = [...selectedLessons].sort((a, b) => a - b);
    if (lessons.some((l) => !chosen[l])) {
      setMessage("יש לבחור ממלאת מקום לכל שיעור");
      return;
    }
    setSending(true);
    setMessage(null);

    const { data: req, error: reqErr } = await supabase
      .from("absence_requests")
      .insert({ teacher_id: teacherId, absence_date: absenceDate, status: "pending" })
      .select()
      .single();
    if (reqErr || !req) {
      setMessage("שגיאה: " + (reqErr?.message ?? ""));
      setSending(false);
      return;
    }

    const lessonRows = lessons.map((l) => {
      const c = chosen[l];
      const missed = mySlots[l];
      return {
        absence_request_id: req.id,
        lesson_number: l,
        substitute_teacher_id: c.teacher_id,
        subject: missed?.subject ?? null,
        class_name: missed?.class_name ?? null,
        grade_level: missed?.grade_level ?? null,
        ability_group: missed?.ability_group ?? null,
      };
    });
    const { data: insertedLessons, error: lessErr } = await supabase
      .from("absence_lessons")
      .insert(lessonRows)
      .select();
    if (lessErr || !insertedLessons) {
      setMessage("שגיאה: " + (lessErr?.message ?? ""));
      setSending(false);
      return;
    }

    const assignRows = insertedLessons.map((al) => ({
      substitute_teacher_id: al.substitute_teacher_id!,
      absence_lesson_id: al.id,
      assignment_date: absenceDate,
      lesson_number: al.lesson_number,
    }));
    const { error: assErr } = await supabase.from("substitute_assignments").insert(assignRows);
    if (assErr) {
      setMessage("שגיאה בשריון ממלאות המקום: " + assErr.message);
      setSending(false);
      return;
    }

    // Fire email notification (best-effort)
    try {
      const { notifyAdminNewRequest } = await import("@/lib/email.functions");
      await notifyAdminNewRequest({
        data: {
          absentTeacherName: teacherName,
          absenceDate,
          lessons: lessons.map((l) => ({ lesson: l, sub: chosen[l].full_name })),
        },
      });
    } catch {
      /* ignore email errors */
    }

    setSending(false);
    router.navigate({ to: "/my-requests" });
  }

  const availableLessons = Object.entries(mySlots)
    .filter(([, s]) => s.status === "teaching")
    .map(([l]) => Number(l))
    .sort((a, b) => a - b);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">דיווח היעדרות</h1>
        <p className="text-sm text-muted-foreground">בחרי תאריך ושיעורים שאת לא יכולה ללמד</p>
      </div>

      {step === "pick" && (
        <div className="space-y-4 rounded-lg border bg-card p-6">
          <div>
            <label className="mb-1 block text-sm font-medium">תאריך היעדרות</label>
            <input
              type="date"
              value={absenceDate}
              onChange={(e) => {
                setAbsenceDate(e.target.value);
                setSelectedLessons(new Set());
              }}
              className="rounded-md border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">סוג ממלאות מקום</label>
            <select
              value={searchType}
              onChange={(e) => setSearchType(e.target.value as typeof searchType)}
              className="rounded-md border bg-background px-3 py-2 text-sm"
            >
              <option value="all">כולן</option>
              <option value="regular">מורות פנימיות בלבד</option>
              <option value="external">ממלאות חיצוניות בלבד</option>
            </select>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium">שיעורים להיעדר</label>
            {availableLessons.length === 0 ? (
              <p className="text-sm text-muted-foreground">אין לך שיעורי הוראה ביום זה.</p>
            ) : (
              <div className="space-y-1">
                {availableLessons.map((l) => {
                  const s = mySlots[l];
                  return (
                    <label key={l} className="flex items-center gap-3 rounded-md border p-2 hover:bg-secondary/50">
                      <input
                        type="checkbox"
                        checked={selectedLessons.has(l)}
                        onChange={() => toggleLesson(l)}
                      />
                      <span className="font-medium">שיעור {l}</span>
                      <span className="text-sm text-muted-foreground">
                        {s.subject} · {s.class_name} · שכבה {s.grade_level}
                        {s.ability_group ? ` · קבוצה ${s.ability_group}` : ""}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
          <button
            onClick={findCandidates}
            disabled={selectedLessons.size === 0}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            מציאת ממלאות מקום
          </button>
        </div>
      )}

      {step === "match" && (
        <div className="space-y-4">
          {[...selectedLessons].sort((a, b) => a - b).map((l) => {
            const missed = mySlots[l];
            const list = candidates[l] ?? [];
            const picked = chosen[l];
            return (
              <div key={l} className="rounded-lg border bg-card p-4">
                <div className="flex items-center justify-between border-b pb-2">
                  <h3 className="font-semibold">
                    שיעור {l} · {missed?.subject} · {missed?.class_name}
                    {missed?.ability_group ? ` · קבוצה ${missed.ability_group}` : ""}
                  </h3>
                  {picked && <span className="text-sm text-primary">נבחרה: {picked.full_name}</span>}
                </div>
                {list.length === 0 ? (
                  <p className="mt-3 text-sm text-muted-foreground">לא נמצאו מועמדות זמינות.</p>
                ) : (
                  <ul className="mt-3 divide-y">
                    {list.slice(0, 10).map((c) => {
                      const s = scoreCandidate(c, missed!);
                      return (
                        <li key={c.teacher_id} className="flex items-center justify-between py-2">
                          <div>
                            <div className="font-medium">{c.full_name}</div>
                            <div className="text-xs text-muted-foreground">
                              {c.phone ?? "אין טלפון"} · {c.type === "external" ? "חיצונית" : "פנימית"} · ציון{" "}
                              {Math.round(s.total)}
                            </div>
                          </div>
                          <button
                            onClick={() => setChosen((prev) => ({ ...prev, [l]: c }))}
                            className={`rounded-md px-3 py-1.5 text-sm ${
                              picked?.teacher_id === c.teacher_id
                                ? "bg-primary text-primary-foreground"
                                : "border hover:bg-secondary"
                            }`}
                          >
                            {picked?.teacher_id === c.teacher_id ? "נבחרה" : "בחירה"}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })}
          <div className="flex gap-2">
            <button
              onClick={() => setStep("pick")}
              className="rounded-md border px-4 py-2 text-sm hover:bg-secondary"
            >
              חזרה
            </button>
            <button
              onClick={() => setStep("summary")}
              disabled={[...selectedLessons].some((l) => !chosen[l])}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              המשך לסיכום
            </button>
          </div>
        </div>
      )}

      {step === "summary" && (
        <div className="space-y-4 rounded-lg border bg-card p-6">
          <h2 className="text-lg font-semibold">סיכום ואישור</h2>
          <div className="text-sm">
            <div>תאריך: <strong>{absenceDate}</strong></div>
            <div>מורה נעדרת: <strong>{teacherName}</strong></div>
          </div>
          <table className="w-full border-collapse text-sm">
            <thead className="bg-secondary">
              <tr>
                <th className="border p-2 text-right">שיעור</th>
                <th className="border p-2 text-right">פרטים</th>
                <th className="border p-2 text-right">ממלאת מקום</th>
              </tr>
            </thead>
            <tbody>
              {[...selectedLessons].sort((a, b) => a - b).map((l) => {
                const m = mySlots[l];
                const c = chosen[l];
                return (
                  <tr key={l}>
                    <td className="border p-2">{l}</td>
                    <td className="border p-2">
                      {m?.subject} · {m?.class_name}
                    </td>
                    <td className="border p-2 font-medium">{c?.full_name}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {message && <div className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">{message}</div>}
          <div className="flex gap-2">
            <button
              onClick={() => setStep("match")}
              className="rounded-md border px-4 py-2 text-sm hover:bg-secondary"
            >
              חזרה
            </button>
            <button
              onClick={submitRequest}
              disabled={sending}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              {sending ? "שולחת..." : "שליחה לאישור המנהלת"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}