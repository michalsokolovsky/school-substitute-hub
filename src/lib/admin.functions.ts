import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Error("אין לך הרשאות מנהלת. הריצי את שאילתת ה-SQL להענקת admin.");
}

function formatServerError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("SUPABASE_SERVICE_ROLE_KEY")) {
    return "חסר מפתח SUPABASE_SERVICE_ROLE_KEY בקובץ .env — נדרש לייבוא אקסל והענקת הרשאות.";
  }
  return message;
}

export const importTeachers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        rows: z.array(
          z.object({
            full_name: z.string().min(1),
            email: z.string().email(),
            phone: z.string().optional().nullable(),
            type: z.enum(["regular", "external"]).default("regular"),
            password: z.string().min(6).optional(),
          }),
        ),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    let supabaseAdmin;
    try {
      ({ supabaseAdmin } = await import("@/integrations/supabase/client.server"));
    } catch (error) {
      throw new Error(formatServerError(error));
    }
    const results: { email: string; ok: boolean; error?: string }[] = [];

    for (const row of data.rows) {
      try {
        const { data: existing } = await supabaseAdmin
          .from("teachers")
          .select("id")
          .eq("email", row.email)
          .maybeSingle();

        if (existing) {
          const { error: upErr } = await supabaseAdmin
            .from("teachers")
            .update({
              full_name: row.full_name,
              phone: row.phone ?? null,
              type: row.type,
            })
            .eq("id", existing.id);
          if (upErr) throw upErr;
        } else {
          const { error: insErr } = await supabaseAdmin.from("teachers").insert({
            email: row.email,
            full_name: row.full_name,
            phone: row.phone ?? null,
            type: row.type,
          });
          if (insErr) throw insErr;
        }

        results.push({ email: row.email, ok: true });
      } catch (e: any) {
        results.push({ email: row.email, ok: false, error: e.message ?? String(e) });
      }
    }
    return { results };
  });

export const clearTeacherAuthAccounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    let supabaseAdmin;
    try {
      ({ supabaseAdmin } = await import("@/integrations/supabase/client.server"));
    } catch (error) {
      throw new Error(formatServerError(error));
    }

    const { data: adminRoles } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");
    const adminIds = new Set((adminRoles ?? []).map((r) => r.user_id));

    const { data: teachers } = await supabaseAdmin
      .from("teachers")
      .select("user_id")
      .not("user_id", "is", null);

    let deleted = 0;
    for (const t of teachers ?? []) {
      if (!t.user_id || adminIds.has(t.user_id)) continue;
      const { error } = await supabaseAdmin.auth.admin.deleteUser(t.user_id);
      if (!error) {
        await supabaseAdmin.from("teachers").update({ user_id: null }).eq("user_id", t.user_id);
        deleted++;
      }
    }
    return { deleted };
  });

export const grantAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ email: z.string().email() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    let supabaseAdmin;
    try {
      ({ supabaseAdmin } = await import("@/integrations/supabase/client.server"));
    } catch (error) {
      throw new Error(formatServerError(error));
    }
    const { data: list } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
    const user = list.users.find((u) => u.email?.toLowerCase() === data.email.toLowerCase());
    if (!user) throw new Error("משתמש לא נמצא — צרי אותו קודם ב-Supabase Authentication");
    await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: user.id, role: "admin" }, { onConflict: "user_id,role" });
    return { ok: true };
  });

// Bootstrap: allow the currently signed-in user to claim admin if no admin exists yet.
// Only works when there are zero admin rows.
export const claimAdminIfNone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: admins } = await context.supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin")
      .limit(1);
    if (admins && admins.length > 0) return { claimed: false, reason: "admin_exists" };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: context.userId, role: "admin" }, { onConflict: "user_id,role" });
    return { claimed: true };
  });