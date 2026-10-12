import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronsDown, ChevronsUp, Download, Search, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { requireAdmin } from "@/lib/auth-guards";
import { downloadXlsx, todayStamp } from "@/lib/export-xlsx";
import { formatClassLabel } from "@/lib/schedule";

export const Route = createFileRoute("/_authenticated/admin/history")({
  beforeLoad: () => requireAdmin(),
  component: AdminHistory,
});

type DecisionStatus = "pending" | "approved" | "rejected";

type Row = {
  id: string;
  absence_date: string;
  status: DecisionStatus;
  decided_at: string | null;
  teachers: { full_name: string } | null;
  absence_lessons: {
    lesson_number: number;
    status: DecisionStatus;
    admin_note: string | null;
    subject: string | null;
    class_name: string | null;
    grade_level: string | null;
    teachers: { full_name: string } | null;
  }[];
};

// "partial" is not stored: it is an approved request in which some lessons were rejected.
type RequestStatus = DecisionStatus | "partial";

const STATUS_LABEL: Record<RequestStatus, string> = {
  pending: "ממתין",
  approved: "אושר",
  partial: "אושר חלקית",
  rejected: "נדחה",
};

const STATUS_STYLE: Record<RequestStatus, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  approved: "bg-green-100 text-green-800",
  partial: "bg-orange-100 text-orange-800",
  rejected: "bg-red-100 text-red-800",
};

function requestStatus(row: Row): RequestStatus {
  if (row.status === "approved" && row.absence_lessons.some((l) => l.status === "rejected")) {
    return "partial";
  }
  return row.status;
}

function monthLabel(month: string) {
  const [year, number] = month.split("-").map(Number);
  return new Date(year, number - 1, 1).toLocaleDateString("he-IL", {
    month: "long",
    year: "numeric",
  });
}

function dayLabel(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString("he-IL", {
    weekday: "long",
    day: "numeric",
    month: "numeric",
    year: "numeric",
  });
}

function AdminHistory() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | RequestStatus>("all");
  const [monthFilter, setMonthFilter] = useState("all");
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());

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

  const months = useMemo(
    () => [...new Set(rows.map((r) => r.absence_date.slice(0, 7)))].sort().reverse(),
    [rows],
  );

  const needle = query.trim().toLowerCase();
  const visible = rows.filter((r) => {
    if (statusFilter !== "all" && requestStatus(r) !== statusFilter) return false;
    if (monthFilter !== "all" && r.absence_date.slice(0, 7) !== monthFilter) return false;
    if (!needle) return true;
    return (
      (r.teachers?.full_name ?? "").toLowerCase().includes(needle) ||
      r.absence_lessons.some((l) => (l.teachers?.full_name ?? "").toLowerCase().includes(needle))
    );
  });

  // The list is already newest first, so requests of the same month sit next to each other.
  const groups: { month: string; rows: Row[] }[] = [];
  for (const row of visible) {
    const month = row.absence_date.slice(0, 7);
    const last = groups[groups.length - 1];
    if (last && last.month === month) last.rows.push(row);
    else groups.push({ month, rows: [row] });
  }

  function toggleRow(id: string) {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  // Open all / close all only touch the requests currently shown.
  function setAllVisible(open: boolean) {
    setOpenIds((prev) => {
      const next = new Set(prev);
      for (const r of visible) {
        if (open) next.add(r.id);
        else next.delete(r.id);
      }
      return next;
    });
  }

  // One spreadsheet row per lesson, so it can be filtered and totalled in Excel.
  function exportToExcel() {
    const data = visible.flatMap((r) =>
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
        {visible.length > 0 && (
          <button
            type="button"
            onClick={exportToExcel}
            title="מייצא את הבקשות המוצגות עכשיו (לפי החיפוש והסינון)"
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
        <>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[220px] flex-1">
              <Search className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="חיפוש לפי שם מורה או ממלאת"
                aria-label="חיפוש בהיסטוריה"
                className="w-full rounded-md border bg-background py-1.5 pl-8 pr-9 text-sm"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="ניקוי החיפוש"
                  className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
              aria-label="סינון לפי סטטוס"
              className="rounded-md border bg-background px-2 py-1.5 text-sm"
            >
              <option value="all">כל הסטטוסים</option>
              {(Object.keys(STATUS_LABEL) as RequestStatus[]).map((status) => (
                <option key={status} value={status}>
                  {STATUS_LABEL[status]}
                </option>
              ))}
            </select>
            <select
              value={monthFilter}
              onChange={(e) => setMonthFilter(e.target.value)}
              aria-label="סינון לפי חודש"
              className="rounded-md border bg-background px-2 py-1.5 text-sm"
            >
              <option value="all">כל החודשים</option>
              {months.map((month) => (
                <option key={month} value={month}>
                  {monthLabel(month)}
                </option>
              ))}
            </select>
            <span className="text-xs text-muted-foreground">
              {visible.length === rows.length
                ? `${rows.length} בקשות`
                : `מוצגות ${visible.length} מתוך ${rows.length}`}
            </span>
            {visible.length > 0 && (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setAllVisible(true)}
                  className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm hover:bg-secondary"
                >
                  <ChevronsDown className="h-4 w-4" />
                  פתחי הכול
                </button>
                <button
                  type="button"
                  onClick={() => setAllVisible(false)}
                  className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm hover:bg-secondary"
                >
                  <ChevronsUp className="h-4 w-4" />
                  סגרי הכול
                </button>
              </div>
            )}
          </div>

          {visible.length === 0 ? (
            <p className="text-muted-foreground">
              לא נמצאו בקשות שמתאימות לחיפוש.{" "}
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setStatusFilter("all");
                  setMonthFilter("all");
                }}
                className="underline hover:text-foreground"
              >
                ניקוי החיפוש
              </button>
            </p>
          ) : (
            <div className="space-y-6">
              {groups.map((group) => (
                <section key={group.month} className="space-y-3">
                  <h2 className="text-sm font-semibold text-muted-foreground">
                    {monthLabel(group.month)} · {group.rows.length} בקשות
                  </h2>
                  {group.rows.map((r) => (
                    <RequestCard
                      key={r.id}
                      row={r}
                      open={openIds.has(r.id)}
                      onToggle={() => toggleRow(r.id)}
                    />
                  ))}
                </section>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function RequestCard({ row, open, onToggle }: { row: Row; open: boolean; onToggle: () => void }) {
  const status = requestStatus(row);
  const lessons = [...row.absence_lessons].sort((a, b) => a.lesson_number - b.lesson_number);
  return (
    <div className="rounded-lg border bg-card">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full flex-wrap items-center justify-between gap-2 px-4 py-3 text-right hover:bg-secondary/50"
      >
        <div className="flex items-center gap-2">
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
          />
          <div>
            <div className="font-semibold">{row.teachers?.full_name}</div>
            <div className="text-sm text-muted-foreground">
              {dayLabel(row.absence_date)} ·{" "}
              {lessons.length === 1 ? "שיעור אחד" : `${lessons.length} שיעורים`}
              {row.decided_at
                ? ` · הוחלט ב-${new Date(row.decided_at).toLocaleDateString("he-IL")}`
                : ""}
            </div>
          </div>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS_STYLE[status]}`}>
          {STATUS_LABEL[status]}
        </span>
      </button>
      {open && (
        <table className="w-full border-t text-sm">
          <thead className="text-right text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-1.5 font-medium">שיעור</th>
              <th className="py-1.5 font-medium">מקצוע וכיתה</th>
              <th className="py-1.5 font-medium">ממלאת מקום</th>
              <th className="px-4 py-1.5 font-medium">החלטה</th>
            </tr>
          </thead>
          <tbody>
            {lessons.map((l) => (
              <tr key={l.lesson_number} className="border-t align-top">
                <td className="px-4 py-2">{l.lesson_number}</td>
                <td className="py-2">
                  {[l.subject, formatClassLabel(l.grade_level ?? "", l.class_name ?? "")]
                    .filter(Boolean)
                    .join(" · ") || "—"}
                </td>
                <td className="py-2">{l.teachers?.full_name ?? "—"}</td>
                <td className="px-4 py-2">
                  {row.status !== "pending" && (
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLE[l.status]}`}
                    >
                      {STATUS_LABEL[l.status]}
                    </span>
                  )}
                  {l.status === "rejected" && l.admin_note && (
                    <div className="mt-1 text-xs text-muted-foreground">סיבה: {l.admin_note}</div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
