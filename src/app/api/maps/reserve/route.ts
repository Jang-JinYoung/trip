import { createClient } from "@supabase/supabase-js";
import { handleMapReservation } from "@/lib/map-budget-handler";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return handleMapReservation(request, async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    // Server-only credential; never returned to the browser.
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key || !process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY)
      return { allowed: false, reason: "not_configured" };
    const client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await client
      .rpc("reserve_google_map_load")
      .abortSignal(AbortSignal.timeout(5000));
    if (error) throw new Error("Map budget reservation failed");
    return data;
  });
}
