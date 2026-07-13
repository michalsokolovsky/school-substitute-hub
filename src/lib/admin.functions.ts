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
  if (!data) throw new Error("Forbidden");
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
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const results: { email: string; ok: boolean; error?: string; password?: string }[] = [];

    for (const row of data.rows) {
      const password = row.password ?? Math.random().toString(36).slice(2, 10) + "A1";
      try {
        // Create auth user (or skip if exists)
        const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
          email: row.email,
          password,
          email_confirm: true,
        });
        let userId: string | null = created?.user?.id ?? null;
        if (createErr && !userId) {
          // maybe already exists — try to find via listUsers
          const { data: list } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
          userId = list.users.find((u) => u.email?.toLowerCase() === row.email.toLowerCase())?.id ?? null;
        }

        // Upsert teacher
        const { error: upErr } = await supabaseAdmin
          .from("teachers")
          .upsert(
            {
              email: row.email,
              full_name: row.full_name,
              phone: row.phone ?? null,
              type: row.type,
              user_id: userId,
            },
            { onConflict: "email" },
          );
        if (upErr) throw upErr;

        // Ensure teacher role
        if (userId) {
          await supabaseAdmin.from("user_roles").upsert(
            { user_id: userId, role: "teacher" },
            { onConflict: "user_id,role" },
          );
        }

        results.push({ email: row.email, ok: true, password: created?.user ? password : undefined });
      } catch (e: any) {
        results.push({ email: row.email, ok: false, error: e.message ?? String(e) });
      }
    }
    return { results };
  });

export const grantAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ email: z.string().email() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: list } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
    const user = list.users.find((u) => u.email?.toLowerCase() === data.email.toLowerCase());
    if (!user) throw new Error("User not found");
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