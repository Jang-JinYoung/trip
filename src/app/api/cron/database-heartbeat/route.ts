import { createClient } from "@supabase/supabase-js";
import { handleDatabaseHeartbeat } from "@/lib/database-heartbeat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

export async function GET(request: Request) {
  return handleDatabaseHeartbeat(request, {
    secret: process.env.CRON_SECRET,
    update: async (checkedAt) => {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!url || !key) throw new Error("Database is not configured");
      const client = createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { error } = await client
        .from("database_heartbeat")
        .upsert({ id: 1, checked_at: checkedAt }, { onConflict: "id" })
        .abortSignal(AbortSignal.timeout(5000));
      if (error) throw new Error("Database heartbeat failed");
    },
  });
}
