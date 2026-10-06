import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import * as XLSX from "xlsx";
import { Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  importTeachers,
  grantAdmin,
  clearTeacherAuthAccounts,
  listAdmins,
  revokeAdmin,
  deleteTeacher,
} from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated/admin/teachers/")({
  component: AdminTeachers,
});

type Teacher = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  type: "regular" | "external";
  schedule_locked: boolean;
  user_id: string | null;
};

type AdminRow = { user_id: string; email: string; full_name: string | null; is_me: boolean };

function cleanKey(key: string) {
  return key.trim().replace(/[\u200f\u200e]/g, "");
}

function pickField(row: Record<string, unknown>, aliases: string[]) {
  const entries = Object.entries(row).map(([k, v]) => [cleanKey(k), v] as const);
  for (const alias of aliases) {
    const hit = entries.find(([k]) => k === alias);
    if (hit?.[1] != null && String(hit[1]).trim()) return String(hit[1]).trim();
  }
  for (const alias of aliases) {
    const hit = entries.find(([k]) => k.includes(alias));
    if (hit?.[1] != null && String(hit[1]).trim()) return String(hit[1]).trim();
  }
  return "";
}

function parseTeacherRows(rowsRaw: Record<string, unknown>[]) {
  return rowsRaw
    .map((raw) => {
      const full_name = pickField(raw, ["שם מלא", "שם", "full_name", "name"]);
      const email = pickField(raw, ["אימייל", "email", "מייל"]);
      const phone = pickField(raw, ["טלפון", "phone", "נייד"]);
      const typeRaw = pickField(raw, ["סוג", "type"]) || "regular";
      const type = ["external", "ממלאת", "חיצונית", "חיצוני", "חיצונ"].some((k) =>
        typeRaw.toLowerCase().includes(k),
      )
        ? "external"
        : "regular";
      return { full_name, email, phone: phone || null, type: type as "regular" | "external" };
    })
    .filter((r) => r.full_name && r.email);
}

function AdminTeachers() {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [importResult, setImportResult] = useState<
    { email: string; ok: boolean; error?: string }[] | null
  >(null);
  const [importing, setImporting] = useState(false);
  const [grantEmail, setGrantEmail] = useState("");
  const [grantMessage, setGrantMessage] = useState<string | null>(null);
  const [granting, setGranting] = useState(false);
  const [clearing, setClearing] = useState(false);
  const importFn = useServerFn(importTeachers);
  const grantFn = useServerFn(grantAdmin);
  const clearFn = useServerFn(clearTeacherAuthAccounts);
  const listAdminsFn = useServerFn(listAdmins);
  const revokeFn = useServerFn(revokeAdmin);
  const deleteFn = useServerFn(deleteTeacher);
  const [admins, setAdmins] = useState<AdminRow[]>([]);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  async function load() {
    const { data } = await supabase.from("teachers").select("*").order("full_name");
    setTeachers((data as Teacher[]) ?? []);
  }

  async function loadAdmins() {
    try {
      const res = await listAdminsFn();
      setAdmins(res.admins);
    } catch {
      setAdmins([]);
    }
  }

  useEffect(() => {
    load();
    loadAdmins();
  }, []);

  const adminUserIds = new Set(admins.map((a) => a.user_id));

  async function onMakeAdmin(t: Teacher) {
    if (!confirm(`להפוך את ${t.full_name} למנהלת? תהיה לה גישה מלאה לניהול המערכת.`)) return;
    setActionMessage(null);
    try {
      await grantFn({ data: { email: t.email } });
      setActionMessage(`${t.full_name} קיבלה הרשאות מנהלת.`);
      loadAdmins();
    } catch (err) {
      setActionMessage("שגיאה: " + (err instanceof Error ? err.message : String(err)));
    }
  }

  async function onRevokeAdmin(userId: string, label: string) {
    if (!confirm(`להסיר את הרשאת המנהלת מ-${label}?`)) return;
    setActionMessage(null);
    try {
      await revokeFn({ data: { userId } });
      setActionMessage(`הרשאת המנהלת של ${label} הוסרה.`);
      loadAdmins();
    } catch (err) {
      setActionMessage("שגיאה: " + (err instanceof Error ? err.message : String(err)));
    }
  }

  async function onDeleteTeacher(t: Teacher) {
    const extra = t.user_id ? " גם חשבון ההתחברות שלה יימחק והיא לא תוכל להתחבר." : "";
    if (
      !confirm(
        `למחוק את ${t.full_name}?${extra}\nהמערכת השבועית שלה, בקשות ההיעדרות שלה ושיבוצי ממלאת המקום שלה יימחקו. אי אפשר לבטל.`,
      )
    ) {
      return;
    }
    setActionMessage(null);
    try {
      await deleteFn({ data: { teacherId: t.id } });
      setActionMessage(`${t.full_name} נמחקה.`);
      load();
    } catch (err) {
      setActionMessage("שגיאה: " + (err instanceof Error ? err.message : String(err)));
      load();
    }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportResult(null);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf);
      const sheet = wb.Sheets[wb.SheetNames[0]];
      if (!sheet) {
        setImportResult([{ email: "—", ok: false, error: "הקובץ ריק או לא תקין" }]);
        return;
      }
      const rowsRaw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
      const rows = parseTeacherRows(rowsRaw);

      if (rows.length === 0) {
        const detectedColumns =
          rowsRaw.length > 0
            ? Object.keys(rowsRaw[0])
                .map(cleanKey)
                .filter(Boolean)
                .join(", ")
            : "לא זוהו עמודות";
        setImportResult([
          {
            email: "—",
            ok: false,
            error: `לא נמצאו שורות תקינות. עמודות בקובץ: ${detectedColumns}. נדרש: שם (או שם מלא) + אימייל`,
          },
        ]);
        return;
      }

      const res = await importFn({ data: { rows } });
      setImportResult(res.results);
      load();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setImportResult([{ email: "—", ok: false, error: message }]);
    } finally {
      setImporting(false);
      e.target.value = "";
    }
  }

  async function unlockSchedule(id: string) {
    if (!confirm("לפתוח את המערכת של המורה לעריכה?")) return;
    await supabase.from("teachers").update({ schedule_locked: false }).eq("id", id);
    load();
  }

  async function onGrantAdmin(e: React.FormEvent) {
    e.preventDefault();
    setGrantMessage(null);
    setGranting(true);
    try {
      await grantFn({ data: { email: grantEmail.trim() } });
      setGrantMessage(`המשתמש ${grantEmail} קיבל הרשאות מנהלת.`);
      setGrantEmail("");
      loadAdmins();
    } catch (err) {
      setGrantMessage("שגיאה: " + (err instanceof Error ? err.message : String(err)));
    }
    setGranting(false);
  }

  async function onClearTeacherAccounts() {
    if (
      !confirm(
        "למחוק את כל חשבונות ההתחברות של המורות? המורות יצטרכו להירשם מחדש ב-/auth/register",
      )
    ) {
      return;
    }
    setClearing(true);
    setGrantMessage(null);
    try {
      const res = await clearFn();
      setGrantMessage(`נמחקו ${res.deleted} חשבונות מורות. המורות יכולות להירשם מחדש.`);
      load();
    } catch (err) {
      setGrantMessage("שגיאה: " + (err instanceof Error ? err.message : String(err)));
    }
    setClearing(false);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">ניהול מורות</h1>
          <p className="text-sm text-muted-foreground">עריכת מערכות וניהול הרשאות</p>
        </div>
        <label
          title="קובץ אקסל עם העמודות: שם מלא, אימייל, טלפון, סוג. לא נוצרות סיסמאות, כל מורה נרשמת בעצמה בדף ההרשמה."
          className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-secondary"
        >
          <Upload className="h-3.5 w-3.5" />
          {importing ? "מייבא..." : "ייבוא מאקסל"}
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={onFile}
            disabled={importing}
            className="sr-only"
          />
        </label>
      </div>

      {importResult && (
        <div className="rounded-lg border bg-card p-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">תוצאות הייבוא</h2>
            <button
              type="button"
              onClick={() => setImportResult(null)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              סגירה
            </button>
          </div>
          <div className="mt-2 max-h-48 overflow-y-auto text-sm">
            {importResult.map((r) => (
              <div key={r.email} className={r.ok ? "text-foreground" : "text-destructive"}>
                {r.email} — {r.ok ? "נוספה לרשימה" : `שגיאה: ${r.error}`}
              </div>
            ))}
          </div>
        </div>
      )}

      <details className="rounded-lg border bg-card p-3 text-sm">
        <summary className="cursor-pointer select-none font-medium">
          מנהלות{admins.length > 0 ? ` (${admins.length})` : ""}
        </summary>
        <div className="mt-3 space-y-3">
          <form onSubmit={onGrantAdmin} className="flex flex-wrap items-center gap-2">
            <input
              type="email"
              required
              placeholder="אימייל של משתמשת קיימת"
              value={grantEmail}
              onChange={(e) => setGrantEmail(e.target.value)}
              className="min-w-[220px] flex-1 rounded-md border bg-background px-2.5 py-1.5 text-xs"
            />
            <button
              type="submit"
              disabled={granting}
              className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-secondary disabled:opacity-60"
            >
              {granting ? "מעדכן..." : "הענקת הרשאת מנהלת"}
            </button>
          </form>
          {grantMessage && <p className="text-xs">{grantMessage}</p>}

          {admins.length > 0 && (
            <ul className="divide-y text-xs">
              {admins.map((a) => (
                <li key={a.user_id} className="flex items-center justify-between gap-2 py-1.5">
                  <span>
                    {a.full_name ? `${a.full_name} · ` : ""}
                    {a.email}
                    {a.is_me && <span className="text-muted-foreground"> (את)</span>}
                  </span>
                  {!a.is_me && (
                    <button
                      type="button"
                      onClick={() => onRevokeAdmin(a.user_id, a.full_name ?? a.email)}
                      className="rounded border border-destructive px-2 py-0.5 text-destructive hover:bg-destructive/10"
                    >
                      הסרת הרשאה
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </details>

      {actionMessage && <div className="rounded-md bg-accent px-3 py-2 text-sm">{actionMessage}</div>}

      <div className="rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-secondary text-right">
            <tr>
              <th className="p-2">שם</th>
              <th className="p-2">אימייל</th>
              <th className="p-2">טלפון</th>
              <th className="p-2">סוג</th>
              <th className="p-2">הרשאה</th>
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
                <td className="p-2">
                  {t.user_id && adminUserIds.has(t.user_id)
                    ? "מנהלת"
                    : t.user_id
                      ? "מורה"
                      : "אין חשבון"}
                </td>
                <td className="p-2">{t.schedule_locked ? "נעולה" : "פתוחה"}</td>
                <td className="p-2 text-left">
                  <div className="flex flex-wrap justify-end gap-1">
                    <Link
                      to="/admin/teachers/$teacherId/schedule"
                      params={{ teacherId: t.id }}
                      className="rounded border px-2 py-1 text-xs hover:bg-secondary"
                    >
                      עריכת מערכת
                    </Link>
                    {t.schedule_locked && (
                      <button
                        type="button"
                        onClick={() => unlockSchedule(t.id)}
                        className="rounded border px-2 py-1 text-xs hover:bg-secondary"
                      >
                        פתיחה למורה
                      </button>
                    )}
                    {t.user_id && !adminUserIds.has(t.user_id) && (
                      <button
                        type="button"
                        onClick={() => onMakeAdmin(t)}
                        className="rounded border px-2 py-1 text-xs hover:bg-secondary"
                      >
                        הפיכה למנהלת
                      </button>
                    )}
                    {t.user_id && adminUserIds.has(t.user_id) && (
                      <button
                        type="button"
                        onClick={() => onRevokeAdmin(t.user_id!, t.full_name)}
                        className="rounded border px-2 py-1 text-xs hover:bg-secondary"
                      >
                        הסרת מנהלת
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onDeleteTeacher(t)}
                      className="rounded border border-destructive px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
                    >
                      מחיקה
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {teachers.length === 0 && (
              <tr>
                <td colSpan={7} className="p-4 text-center text-muted-foreground">
                  אין מורות. ייבאי מאקסל.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <details className="rounded-lg border bg-card p-3 text-sm">
        <summary className="cursor-pointer select-none text-muted-foreground">פעולות מתקדמות</summary>
        <div className="mt-3">
          <p className="text-muted-foreground">
            מחיקת כל חשבונות ההתחברות של המורות. המורות יישארו ברשימה ויוכלו להירשם מחדש עם סיסמה
            משלהן.
          </p>
          <button
            type="button"
            onClick={onClearTeacherAccounts}
            disabled={clearing}
            className="mt-2 rounded-md border border-destructive px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10 disabled:opacity-60"
          >
            {clearing ? "מוחק..." : "מחיקת חשבונות מורות (הרשמה מחדש)"}
          </button>
        </div>
      </details>
    </div>
  );
}
