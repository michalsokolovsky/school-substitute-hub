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

async function getAdminClient() {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return supabaseAdmin;
  } catch (error) {
    throw new Error(formatServerError(error));
  }
}

export const listAdmins = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const supabaseAdmin = await getAdminClient();
    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");

    const admins: { user_id: string; email: string; full_name: string | null; is_me: boolean }[] =
      [];
    for (const r of roles ?? []) {
      const { data: u } = await supabaseAdmin.auth.admin.getUserById(r.user_id);
      const { data: t } = await supabaseAdmin
        .from("teachers")
        .select("full_name")
        .eq("user_id", r.user_id)
        .maybeSingle();
      admins.push({
        user_id: r.user_id,
        email: u.user?.email ?? "",
        full_name: t?.full_name ?? null,
        is_me: r.user_id === context.userId,
      });
    }
    return { admins };
  });

export const revokeAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (data.userId === context.userId) {
      throw new Error("אי אפשר להסיר הרשאת מנהלת מעצמך.");
    }
    const supabaseAdmin = await getAdminClient();
    const { count } = await supabaseAdmin
      .from("user_roles")
      .select("*", { count: "exact", head: true })
      .eq("role", "admin");
    if ((count ?? 0) <= 1) {
      throw new Error("זו המנהלת היחידה במערכת, אי אפשר להסיר אותה.");
    }
    const { error } = await supabaseAdmin
      .from("user_roles")
      .delete()
      .eq("user_id", data.userId)
      .eq("role", "admin");
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Removes the teacher and, if she has one, her login account (so she can no longer sign in).
// Her schedule, her own absence requests and the substitute bookings she holds are deleted with her.
export const deleteTeacher = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ teacherId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const supabaseAdmin = await getAdminClient();

    const { data: teacher } = await supabaseAdmin
      .from("teachers")
      .select("id, user_id")
      .eq("id", data.teacherId)
      .maybeSingle();
    if (!teacher) throw new Error("המורה לא נמצאה.");

    if (teacher.user_id) {
      if (teacher.user_id === context.userId) {
        throw new Error("אי אפשר למחוק את החשבון שלך.");
      }
      const { data: adminRole } = await supabaseAdmin
        .from("user_roles")
        .select("user_id")
        .eq("user_id", teacher.user_id)
        .eq("role", "admin")
        .maybeSingle();
      if (adminRole) {
        throw new Error("המורה היא גם מנהלת. יש להסיר קודם את הרשאת המנהלת.");
      }
    }

    const { error } = await supabaseAdmin.from("teachers").delete().eq("id", teacher.id);
    if (error) throw new Error(error.message);

    if (teacher.user_id) {
      const { error: authErr } = await supabaseAdmin.auth.admin.deleteUser(teacher.user_id);
      if (authErr) {
        throw new Error("המורה נמחקה, אך מחיקת חשבון ההתחברות נכשלה: " + authErr.message);
      }
    }
    return { ok: true };
  });
