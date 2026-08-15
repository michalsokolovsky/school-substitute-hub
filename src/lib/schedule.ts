import { supabase } from "@/integrations/supabase/client";

export const SCHEDULE_DAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי"] as const;
export const SCHEDULE_LESSONS = [1, 2, 3, 4, 5, 6, 7, 8] as const;

export const SLOT_STATUS_LABEL: Record<SlotStatus, string> = {
  teaching: "מלמדת",
  free: "חלון",
  available: "פנויה למילוי",
  unavailable: "לא זמינה",
};

export type SlotStatus = "teaching" | "free" | "available" | "unavailable";

export type ScheduleSlot = {
  status: SlotStatus;
  subject: string;
  class_name: string;
  grade_level: string;
  ability_group: string;
};

export type ScheduleSlotRow = {
  day: number;
  lesson_number: number;
  status: SlotStatus;
  subject: string | null;
  class_name: string | null;
  grade_level: string | null;
  ability_group: string | null;
};

export const CLASS_NUMBERS = ["1", "2", "3"] as const;
export const CLASS_LETTERS = ["א", "ב", "ג", "ד", "ה", "ו", "ז", "ח"] as const;
export const ABILITY_GROUPS = ["א'1", "א'2", "א'3"] as const;

export function emptyScheduleSlot(): ScheduleSlot {
  return { status: "free", subject: "", class_name: "", grade_level: "", ability_group: "" };
}

/** English or accounting — show ability-group picker. */
export function needsAbilityGroup(subject: string) {
  const s = subject.trim().toLowerCase();
  return ["אנגלית", "english", "חשבון", "accounting"].includes(s);
}

/** @deprecated use needsAbilityGroup */
export function isMathOrEnglish(subject: string) {
  return needsAbilityGroup(subject);
}

export function formatClassLabel(gradeLevel: string, className: string) {
  const num = gradeLevel.trim();
  const letter = className.trim();
  if (num && letter) return `${num}${letter}`;
  if (letter && CLASS_NUMBERS.some((n) => letter.startsWith(n))) return letter;
  return letter || num || "";
}

export function parseClassFields(className: string, gradeLevel: string) {
  const numFromLevel = CLASS_NUMBERS.includes(gradeLevel as (typeof CLASS_NUMBERS)[number])
    ? gradeLevel
    : "";
  const letterFromName = CLASS_LETTERS.includes(className as (typeof CLASS_LETTERS)[number])
    ? className
    : "";

  if (numFromLevel && letterFromName) {
    return { classNumber: numFromLevel, classLetter: letterFromName };
  }

  const combined = (className || gradeLevel).trim();
  const numMatch = combined.match(/^([1-3])/);
  const letterMatch = combined.match(/([א-ח])$/);
  return {
    classNumber: numMatch?.[1] ?? "",
    classLetter: letterMatch?.[1] ?? letterFromName,
  };
}

export function buildEmptyGrid(): Record<string, ScheduleSlot> {
  const grid: Record<string, ScheduleSlot> = {};
  SCHEDULE_DAYS.forEach((_, d) =>
    SCHEDULE_LESSONS.forEach((l) => {
      grid[`${d}-${l}`] = emptyScheduleSlot();
    }),
  );
  return grid;
}

export function slotsToGrid(
  slots: Array<{
    day: number;
    lesson_number: number;
    status: SlotStatus;
    subject: string | null;
    class_name: string | null;
    grade_level: string | null;
    ability_group: string | null;
  }>,
): Record<string, ScheduleSlot> {
  const grid = buildEmptyGrid();
  slots.forEach((s) => {
    grid[`${s.day}-${s.lesson_number}`] = {
      status: s.status,
      subject: s.subject ?? "",
      class_name: s.class_name ?? "",
      grade_level: s.grade_level ?? "",
      ability_group: s.ability_group ?? "",
    };
  });
  return grid;
}

export function gridToRows(teacherId: string, grid: Record<string, ScheduleSlot>) {
  return Object.entries(grid).map(([key, s]) => {
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
        s.status === "teaching" && needsAbilityGroup(s.subject) ? s.ability_group || null : null,
    };
  });
}

export async function fetchScheduleForTeacher(teacherId: string) {
  const { data: slots, error } = await supabase
    .from("schedule_slots")
    .select("day, lesson_number, status, subject, class_name, grade_level, ability_group")
    .eq("teacher_id", teacherId);
  if (error) throw error;
  return slotsToGrid((slots ?? []) as ScheduleSlotRow[]);
}

export async function saveScheduleForTeacher(
  teacherId: string,
  grid: Record<string, ScheduleSlot>,
  options?: { lockAfter?: boolean },
): Promise<{ error?: string }> {
  const rows = gridToRows(teacherId, grid);
  const { error } = await supabase
    .from("schedule_slots")
    .upsert(rows, { onConflict: "teacher_id,day,lesson_number" });
  if (error) return { error: error.message };

  if (options?.lockAfter) {
    const { error: lockError } = await supabase
      .from("teachers")
      .update({ schedule_locked: true })
      .eq("id", teacherId);
    if (lockError) return { error: lockError.message };
  }

  return {};
}
