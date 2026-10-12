import { createFileRoute } from "@tanstack/react-router";
import { sendPendingRequestsReminder } from "@/lib/pending-reminder";

// Called once a day by the scheduled job configured in vite.config.ts. Vercel sends
// "Authorization: Bearer <CRON_SECRET>" when the CRON_SECRET environment variable is set; without
// the secret the endpoint refuses every request, so nobody else can trigger the emails.
export const Route = createFileRoute("/api/cron/pending-reminder")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const secret = process.env.CRON_SECRET;
        if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
          return new Response("Unauthorized", { status: 401 });
        }
        try {
          return Response.json(await sendPendingRequestsReminder());
        } catch (error) {
          console.error("[pending reminder failed]", error);
          return new Response("Failed", { status: 500 });
        }
      },
    },
  },
});
