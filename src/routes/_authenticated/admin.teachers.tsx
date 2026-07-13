import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { importTeachers } from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated/admin/teachers")({
  component: AdminTeachers,
});

type Teacher = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  type: "regular" | "external";
  schedule_locked: boolean;
};

function AdminTeachers() {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [importResult, setImportResult] = useState<{ email: string; ok: boolean; error?: string; password?: string }[] | null>(null);
  const [importing, setImporting] = useState(false);
  const importFn = useServerFn(importTeachers);

  async function load() {
    const { data } = await supabase.from("teachers").select("*").order("full_name");
    setTeachers((data as Teacher[]) ?? []);
  }
  useEffect(() => {
    load();
  }, []);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportResult(null);
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rowsRaw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
    const rows = rowsRaw
      .map((r) => {
        // Accept Hebrew or English column headers
        const full_name = String(r["שם מלא"] ?? r["full_name"] ?? r["name"] ?? "").trim();
        const email = String(r["אימייל"] ?? r["email"] ?? "").trim();
        const phone = String(r["טלפון"] ?? r["phone"] ?? "").trim();
        const typeRaw = String(r["סוג"] ?? r["type"] ?? "regular").trim().toLowerCase();
        const type = ["external", "ממלאת", "חיצונית", "חיצוני"].some((k) => typeRaw.includes(k))
          ? "external"
          : "regular";
        return { full_name, email, phone: phone || null, type: type as "regular" | "external" };
      })
      .filter((r) => r.full_name && r.email);

    const res = await importFn({ data: { rows } });
    setImportResult(res.results);
    setImporting(false);
    load();
    e.target.value = "";
  }

  async function unlockSchedule(id: string) {
    if (!confirm("לפתוח את המערכת של המורה לעריכה?")) return;
    await supabase.from("teachers").update({ schedule_locked: false }).eq("id", id);
    load();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">ניהול מורות</h1>
        <p className="text-sm text-muted-foreground">ייבוא מקובץ אקסל וניהול רשימת המורות</p>
      </div>

      <div className="rounded-lg border bg-card p-4">
        <h2 className="font-semibold">ייבוא מאקסל</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          קובץ עם עמודות: שם מלא, אימייל, טלפון, סוג (regular / external). לכל מורה תיווצר סיסמה זמנית.
        </p>
        <input
          type="file"
          accept=".xlsx,.xls"
          onChange={onFile}
          disabled={importing}
          className="mt-3 block text-sm"
        />
        {importing && <p className="mt-2 text-sm text-muted-foreground">מייבא...</p>}
        {importResult && (
          <div className="mt-3 max-h-64 overflow-y-auto rounded border bg-background p-2 text-sm">
            {importResult.map((r) => (
              <div key={r.email} className={r.ok ? "text-foreground" : "text-destructive"}>
                {r.email} — {r.ok ? `נוצרה${r.password ? ` (סיסמה: ${r.password})` : ""}` : `שגיאה: ${r.error}`}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-secondary text-right">
            <tr>
              <th className="p-2">שם</th>
              <th className="p-2">אימייל</th>
              <th className="p-2">טלפון</th>
              <th className="p-2">סוג</th>
              <th className="p-2">מערכת</th>
              <th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {teachers.map((t) => (
              <tr key={t.id} className="border-t">
                <td className="p-2 font-medium">{t.full_name}</td>
                <td className="p-2">{t.email}</td>
                <td className="p-2">{t.phone ?? "—"}</td>
                <td className="p-2">{t.type === "external" ? "חיצונית" : "פנימית"}</td>
                <td className="p-2">{t.schedule_locked ? "נעולה" : "פתוחה"}</td>
                <td className="p-2 text-left">
                  {t.schedule_locked && (
                    <button
                      onClick={() => unlockSchedule(t.id)}
                      className="rounded border px-2 py-1 text-xs hover:bg-secondary"
                    >
                      פתיחת עריכה
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {teachers.length === 0 && (
              <tr>
                <td colSpan={6} className="p-4 text-center text-muted-foreground">
                  אין מורות. ייבאי מאקסל.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}