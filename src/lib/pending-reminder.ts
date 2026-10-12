import { appBaseUrl, escapeHtml, sendEmail } from "@/lib/email.functions";

/** A request counts as overdue once it has waited this long without a decision. */
const OVERDUE_AFTER_HOURS = 24;

type OverdueRequest = {
  id: string;
  absence_date: string;
  created_at: string;
  teachers: { full_name: string } | null;
  absence_lessons: { id: string }[];
};

/**
 * Emails every admin one summary of the requests that have waited more than a day. Sends nothing
 * when none are overdue. Called once a day by the scheduled job in /api/cron/pending-reminder.
 */
export async function sendPendingRequestsReminder() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const cutoff = new Date(Date.now() - OVERDUE_AFTER_HOURS * 3_600_000).toISOString();
  const { data, error } = await supabaseAdmin
    .from("absence_requests")
    .select("id, absence_date, created_at, teachers:teacher_id(full_name), absence_lessons(id)")
    .eq("status", "pending")
    .lt("created_at", cutoff)
    .order("created_at");
  if (error) throw new Error(error.message);
  const overdue = (data ?? []) as unknown as OverdueRequest[];
  if (overdue.length === 0) return { overdue: 0, emailed: 0 };

  const { data: adminRoles } = await supabaseAdmin
    .from("user_roles")
    .select("user_id")
    .eq("role", "admin");
  const emails = new Set<string>();
  for (const role of adminRoles ?? []) {
    const { data: user } = await supabaseAdmin.auth.admin.getUserById(role.user_id);
    if (user.user?.email) emails.add(user.user.email);
  }
  if (emails.size === 0) return { overdue: overdue.length, emailed: 0 };

  const waitingDays = (createdAt: string) =>
    Math.max(1, Math.floor((Date.now() - new Date(createdAt).getTime()) / 86_400_000));
  const rows = overdue
    .map((r) => {
      const days = waitingDays(r.created_at);
      return `<tr><td>${escapeHtml(r.teachers?.full_name ?? "")}</td><td>${escapeHtml(r.absence_date)}</td><td>${r.absence_lessons.length}</td><td>${days === 1 ? "יום" : `${days} ימים`}</td></tr>`;
    })
    .join("");
  const link = `${await appBaseUrl()}/admin`;
  const subject =
    overdue.length === 1
      ? "בקשה אחת ממתינה לאישור כבר יותר מיום"
      : `${overdue.length} בקשות ממתינות לאישור כבר יותר מיום`;
  const html = `
    <div dir="rtl" style="font-family: Arial, sans-serif;">
      <h2>${subject}</h2>
      <table border="1" cellpadding="6" style="border-collapse:collapse;">
        <thead><tr><th>מורה</th><th>תאריך היעדרות</th><th>שיעורים</th><th>ממתינה</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p style="margin:24px 0;">
        <a href="${link}" style="display:inline-block;background:#0e7490;color:#ffffff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:bold;">
          לאישור או דחייה לחצי כאן
        </a>
      </p>
      <p style="font-size:12px;color:#666;">אם הכפתור לא נפתח, העתיקי את הקישור הזה לדפדפן: ${link}</p>
    </div>
  `;

  for (const to of emails) {
    await sendEmail({ to, subject, html });
  }
  return { overdue: overdue.length, emailed: emails.size };
}
