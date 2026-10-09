import { createClient } from "@supabase/supabase-js";
import { handleLocalAdminLogin } from "@/lib/local-admin-login";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return handleLocalAdminLogin(
    request,
    process.env.NODE_ENV === "development",
    async () => {
      // Unreachable in production. This file is excluded from Git and Vercel.
      // Only the user's session is returned, never the original password.
      const { readFile } = await import("node:fs/promises");
      const { join } = await import("node:path");
      const credentials = JSON.parse(
        await readFile(
          join(process.cwd(), ".local-data", "admin-account.json"),
          "utf8",
        ),
      );
      if (
        credentials.email !== "admin@trip.local" ||
        typeof credentials.password !== "string"
      )
        throw new Error("Invalid local account configuration");
      const client = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
          },
        },
      );
      const { data, error } = await client.auth.signInWithPassword(credentials);
      if (error || !data.session || data.user?.email !== credentials.email)
        throw new Error("Local sign-in failed");
      return {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      };
    },
  );
}
