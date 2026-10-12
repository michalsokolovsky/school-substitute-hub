import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import * as XLSX from "xlsx";
import {
  EllipsisVertical,
  Search,
  ShieldCheck,
  TriangleAlert,
  Upload,
  UserPlus,
  X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

const EMPTY_NEW_TEACHER = {
  full_name: "",
  email: "",
  phone: "",
  type: "regular" as Teacher["type"],
};
const RESET_WORD = "איפוס";

function AdminTeachers() {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [newTeacher, setNewTeacher] = useState(EMPTY_NEW_TEACHER);
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [adminsOpen, setAdminsOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetText, setResetText] = useState("");
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
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "no_account" | "locked" | "open" | "external">(
    "all",
  );

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

  const digitsOnly = (value: string) => value.replace(/\D/g, "");
  const needle = query.trim().toLowerCase();
  const visibleTeachers = teachers.filter((t) => {
    if (filter === "no_account" && t.user_id) return false;
    if (filter === "locked" && !t.schedule_locked) return false;
    if (filter === "open" && t.schedule_locked) return false;
    if (filter === "external" && t.type !== "external") return false;
    if (!needle) return true;
    const phoneDigits = digitsOnly(needle);
    return (
      t.full_name.toLowerCase().includes(needle) ||
      t.email.toLowerCase().includes(needle) ||
      (phoneDigits !== "" && digitsOnly(t.phone ?? "").includes(phoneDigits))
    );
  });

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
            ? Object.keys(rowsRaw[0]).map(cleanKey).filter(Boolean).join(", ")
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

  async function toggleScheduleLock(t: Teacher) {
    const lock = !t.schedule_locked;
    const question = lock
      ? `לסגור את המערכת של ${t.full_name} לעריכה? היא לא תוכל לשנות אותה.`
      : `לפתוח את המערכת של ${t.full_name} לעריכה?`;
    if (!confirm(question)) return;
    setActionMessage(null);
    const { error } = await supabase
      .from("teachers")
      .update({ schedule_locked: lock })
      .eq("id", t.id);
    if (error) setActionMessage("שגיאה: " + error.message);
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
    if (resetText.trim() !== RESET_WORD) return;
    setClearing(true);
    setActionMessage(null);
    try {
      const res = await clearFn();
      setActionMessage(`נמחקו ${res.deleted} חשבונות מורות. המורות יכולות להירשם מחדש.`);
      load();
    } catch (err) {
      setActionMessage("שגיאה: " + (err instanceof Error ? err.message : String(err)));
    }
    setClearing(false);
    setResetOpen(false);
    setResetText("");
  }

  async function onAddTeacher(e: React.FormEvent) {
    e.preventDefault();
    setAddError(null);
    const full_name = newTeacher.full_name.trim();
    const email = newTeacher.email.trim();
    if (teachers.some((t) => t.email.toLowerCase() === email.toLowerCase())) {
      setAddError("כבר קיימת מורה עם האימייל הזה.");
      return;
    }
    setAdding(true);
    try {
      const res = await importFn({
        data: {
          rows: [
            { full_name, email, phone: newTeacher.phone.trim() || null, type: newTeacher.type },
          ],
        },
      });
      const result = res.results[0];
      if (!result?.ok) {
        setAddError(result?.error ?? "שגיאה בהוספת המורה.");
      } else {
        setActionMessage(`${full_name} נוספה לרשימה. היא נרשמת בעצמה בדף ההרשמה.`);
        setAddOpen(false);
        setNewTeacher(EMPTY_NEW_TEACHER);
        load();
      }
    } catch (err) {
      setAddError(err instanceof Error ? err.message : String(err));
    }
    setAdding(false);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">ניהול מורות</h1>
          <p className="text-sm text-muted-foreground">עריכת מערכות וניהול הרשאות</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <UserPlus />
            הוספת מורה
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" aria-label="אפשרויות נוספות">
                <EllipsisVertical />
                אפשרויות נוספות
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuItem
                disabled={importing}
                onSelect={() => fileRef.current?.click()}
                title="קובץ אקסל עם העמודות: שם מלא, אימייל, טלפון, סוג. לא נוצרות סיסמאות, כל מורה נרשמת בעצמה בדף ההרשמה."
              >
                <Upload className="ml-2 h-4 w-4" />
                {importing ? "מייבא..." : "ייבוא מורות מאקסל"}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setAdminsOpen(true)}>
                <ShieldCheck className="ml-2 h-4 w-4" />
                מנהלות והרשאות{admins.length > 0 ? ` (${admins.length})` : ""}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onSelect={() => setResetOpen(true)}
              >
                <TriangleAlert className="ml-2 h-4 w-4" />
                איפוס חשבונות התחברות
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={onFile}
            disabled={importing}
            className="sr-only"
          />
        </div>
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

      {actionMessage && (
        <div className="rounded-md bg-accent px-3 py-2 text-sm">{actionMessage}</div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="חיפוש לפי שם, אימייל או טלפון"
            aria-label="חיפוש מורה"
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
          value={filter}
          onChange={(e) => setFilter(e.target.value as typeof filter)}
          aria-label="סינון מורות"
          className="rounded-md border bg-background px-2 py-1.5 text-sm"
        >
          <option value="all">כל המורות</option>
          <option value="no_account">עדיין לא נרשמו</option>
          <option value="locked">מערכת נעולה</option>
          <option value="open">מערכת פתוחה</option>
          <option value="external">חיצוניות</option>
        </select>
        <span className="text-xs text-muted-foreground">
          {visibleTeachers.length === teachers.length
            ? `${teachers.length} מורות`
            : `מוצגות ${visibleTeachers.length} מתוך ${teachers.length}`}
        </span>
      </div>

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
            {visibleTeachers.map((t) => (
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
                    <button
                      type="button"
                      onClick={() => toggleScheduleLock(t)}
                      className="rounded border px-2 py-1 text-xs hover:bg-secondary"
                    >
                      {t.schedule_locked ? "פתיחה למורה" : "סגירה למורה"}
                    </button>
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
                  אין מורות עדיין. הוסיפי מורה או ייבאי מאקסל.
                </td>
              </tr>
            )}
            {teachers.length > 0 && visibleTeachers.length === 0 && (
              <tr>
                <td colSpan={7} className="p-4 text-center text-muted-foreground">
                  לא נמצאו מורות שמתאימות לחיפוש.{" "}
                  <button
                    type="button"
                    onClick={() => {
                      setQuery("");
                      setFilter("all");
                    }}
                    className="underline hover:text-foreground"
                  >
                    ניקוי החיפוש
                  </button>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog
        open={addOpen}
        onOpenChange={(open) => {
          setAddOpen(open);
          if (!open) {
            setAddError(null);
            setNewTeacher(EMPTY_NEW_TEACHER);
          }
        }}
      >
        <DialogContent>
          <form onSubmit={onAddTeacher} className="space-y-4">
            <DialogHeader className="text-right">
              <DialogTitle>הוספת מורה</DialogTitle>
              <DialogDescription>
                המורה נוספת לרשימה בלי סיסמה. היא נרשמת בעצמה בדף ההרשמה עם האימייל הזה.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 text-sm">
              <label className="block space-y-1">
                <span className="font-medium">שם מלא</span>
                <input
                  required
                  value={newTeacher.full_name}
                  onChange={(e) => setNewTeacher({ ...newTeacher, full_name: e.target.value })}
                  className="w-full rounded-md border bg-background px-2.5 py-1.5"
                />
              </label>
              <label className="block space-y-1">
                <span className="font-medium">אימייל</span>
                <input
                  required
                  type="email"
                  dir="ltr"
                  value={newTeacher.email}
                  onChange={(e) => setNewTeacher({ ...newTeacher, email: e.target.value })}
                  className="w-full rounded-md border bg-background px-2.5 py-1.5 text-left"
                />
              </label>
              <label className="block space-y-1">
                <span className="font-medium">
                  טלפון <span className="font-normal text-muted-foreground">(לא חובה)</span>
                </span>
                <input
                  type="tel"
                  dir="ltr"
                  value={newTeacher.phone}
                  onChange={(e) => setNewTeacher({ ...newTeacher, phone: e.target.value })}
                  className="w-full rounded-md border bg-background px-2.5 py-1.5 text-left"
                />
              </label>
              <label className="block space-y-1">
                <span className="font-medium">סוג</span>
                <select
                  value={newTeacher.type}
                  onChange={(e) =>
                    setNewTeacher({ ...newTeacher, type: e.target.value as Teacher["type"] })
                  }
                  className="w-full rounded-md border bg-background px-2.5 py-1.5"
                >
                  <option value="regular">פנימית</option>
                  <option value="external">חיצונית (ממלאת)</option>
                </select>
              </label>
              {addError && <p className="text-destructive">{addError}</p>}
            </div>
            <DialogFooter className="gap-2 sm:justify-start">
              <Button type="submit" disabled={adding}>
                {adding ? "מוסיפה..." : "הוספה"}
              </Button>
              <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>
                ביטול
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={adminsOpen} onOpenChange={setAdminsOpen}>
        <DialogContent>
          <DialogHeader className="text-right">
            <DialogTitle>מנהלות והרשאות</DialogTitle>
            <DialogDescription>
              מנהלת רואה ומנהלת את כל המערכת. אפשר להוסיף מנהלת לפי האימייל של משתמשת שכבר נרשמה.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={onGrantAdmin} className="flex flex-wrap items-center gap-2">
            <input
              type="email"
              required
              dir="ltr"
              placeholder="אימייל של משתמשת קיימת"
              value={grantEmail}
              onChange={(e) => setGrantEmail(e.target.value)}
              className="min-w-[200px] flex-1 rounded-md border bg-background px-2.5 py-1.5 text-left text-sm"
            />
            <Button type="submit" size="sm" disabled={granting}>
              {granting ? "מעדכנת..." : "הוספת מנהלת"}
            </Button>
          </form>
          {grantMessage && <p className="text-sm">{grantMessage}</p>}
          {admins.length > 0 && (
            <ul className="max-h-64 divide-y overflow-y-auto text-sm">
              {admins.map((a) => (
                <li key={a.user_id} className="flex items-center justify-between gap-2 py-2">
                  <span>
                    {a.full_name ? `${a.full_name} · ` : ""}
                    {a.email}
                    {a.is_me && <span className="text-muted-foreground"> (את)</span>}
                  </span>
                  {!a.is_me && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="border-destructive text-destructive hover:bg-destructive/10"
                      onClick={() => onRevokeAdmin(a.user_id, a.full_name ?? a.email)}
                    >
                      הסרת הרשאה
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={resetOpen}
        onOpenChange={(open) => {
          setResetOpen(open);
          if (!open) setResetText("");
        }}
      >
        <DialogContent>
          <DialogHeader className="text-right">
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <TriangleAlert className="h-5 w-5" />
              איפוס חשבונות התחברות
            </DialogTitle>
            <DialogDescription>
              הפעולה מוחקת את כל חשבונות ההתחברות של המורות. הן נשארות ברשימה ויכולות להירשם מחדש עם
              סיסמה משלהן. חשבונות מנהלות לא נמחקים. אי אפשר לבטל.
            </DialogDescription>
          </DialogHeader>
          <label className="block space-y-1 text-sm">
            <span>
              כדי להמשיך, הקלידי: <strong>{RESET_WORD}</strong>
            </span>
            <input
              value={resetText}
              onChange={(e) => setResetText(e.target.value)}
              className="w-full rounded-md border bg-background px-2.5 py-1.5"
            />
          </label>
          <DialogFooter className="gap-2 sm:justify-start">
            <Button
              type="button"
              variant="destructive"
              disabled={clearing || resetText.trim() !== RESET_WORD}
              onClick={onClearTeacherAccounts}
            >
              {clearing ? "מאפסת..." : "איפוס חשבונות"}
            </Button>
            <Button type="button" variant="outline" onClick={() => setResetOpen(false)}>
              ביטול
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
