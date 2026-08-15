import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const setupTeacherProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        full_name: z.string().min(1),
        phone: z.string().optional().nullable(),
        type: z.enum(["regular", "external"]).default("regular"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: userData, error: userErr } =
      await supabaseAdmin.auth.admin.getUserById(context.userId);
    if (userErr || !userData.user?.email) throw new Error("לא נמצא אימייל למשתמש");

    const email = userData.user.email;

    const { data: existing } = await supabaseAdmin
      .from("teachers")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (existing) {
      const { error } = await supabaseAdmin
        .from("teachers")
        .update({
          user_id: context.userId,
          full_name: data.full_name,
          phone: data.phone ?? null,
          type: data.type,
        })
        .eq("id", existing.id);
      if (error) throw error;
    } else {
      const { error } = await supabaseAdmin.from("teachers").insert({
        email,
        full_name: data.full_name,
        phone: data.phone ?? null,
        type: data.type,
        user_id: context.userId,
      });
      if (error) throw error;
    }

    await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: context.userId, role: "teacher" }, { onConflict: "user_id,role" });

    return { ok: true };
  });
