import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const RESEND_URL = "https://api.resend.com";

async function sendEmail(input: {
  to: string;
  subject: string;
  html: string;
  from?: string;
}) {
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_API_KEY) {
    console.log("[email skipped — Resend not configured]", input.to, input.subject);
    return { skipped: true };
  }
  const from = input.from ?? process.env.EMAIL_FROM ?? "מערכת ממלאות מקום <onboarding@resend.dev>";
  // Testing aid: with EMAIL_OVERRIDE_TO set, every email goes to that address instead of the real
  // recipient. Needed while Resend has no verified domain (it only delivers to the account owner).
  const override = process.env.EMAIL_OVERRIDE_TO?.trim();
  if (override) {
    input = { ...input, to: override, subject: `[נועד ל-${input.to}] ${input.subject}` };
  }
  const res = await fetch(`${RESEND_URL}/emails`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({ from, to: [input.to], subject: input.subject, html: input.html }),
  });
  if (!res.ok) {
    const text = await res.text();
    console.error("[email send failed]", res.status, text);
    return { error: text };
  }
  return { ok: true };
}

export const notifyAdminNewRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        absentTeacherName: z.string(),
        absenceDate: z.string(),
        lessons: z.array(z.object({ lesson: z.number(), sub: z.string() })),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    // Find admin emails. Must use the service-role client: RLS on user_roles only lets a
    // teacher see her own rows, so a user-scoped query never finds the admins.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: admins } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");
    if (!admins || admins.length === 0) return { skipped: true };

    const emails: string[] = [];
    for (const a of admins) {
      const { data: u } = await supabaseAdmin.auth.admin.getUserById(a.user_id);
      if (u.user?.email) emails.push(u.user.email);
    }

    const html = `
      <div dir="rtl" style="font-family: Arial, sans-serif;">
        <h2>בקשת ממלאת מקום חדשה</h2>
        <p><strong>מורה נעדרת:</strong> ${data.absentTeacherName}</p>
        <p><strong>תאריך:</strong> ${data.absenceDate}</p>
        <table border="1" cellpadding="6" style="border-collapse:collapse;">
          <thead><tr><th>שיעור</th><th>ממלאת מקום</th></tr></thead>
          <tbody>
            ${data.lessons.map((l) => `<tr><td>${l.lesson}</td><td>${l.sub}</td></tr>`).join("")}
          </tbody>
        </table>
        <p>יש להיכנס למערכת לאישור או דחייה.</p>
      </div>
    `;
    for (const to of emails) {
      await sendEmail({ to, subject: "בקשת ממלאת מקום חדשה", html });
    }
    return { ok: true };
  });

export const notifyTeacherDecision = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        teacherEmail: z.string().email(),
        absenceDate: z.string(),
        approved: z.boolean(),
        note: z.string().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const html = `
      <div dir="rtl" style="font-family: Arial, sans-serif;">
        <h2>${data.approved ? "בקשת ההיעדרות אושרה" : "בקשת ההיעדרות נדחתה"}</h2>
        <p>תאריך: ${data.absenceDate}</p>
        ${data.note ? `<p>הערה: ${data.note}</p>` : ""}
      </div>
    `;
    return sendEmail({
      to: data.teacherEmail,
      subject: data.approved ? "בקשת ההיעדרות אושרה" : "בקשת ההיעדרות נדחתה",
      html,
    });
  });