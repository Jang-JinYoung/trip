import { timingSafeEqual } from "node:crypto";

// Inclusive through November 17 in Korea. The year is fixed deliberately.
export const HEARTBEAT_END = "2026-11-18T00:00:00+09:00";

export async function handleDatabaseHeartbeat(
  request: Request,
  options: {
    secret: string | undefined;
    update: (checkedAt: string) => Promise<void>;
    now?: () => number;
  },
) {
  const headers = { "Cache-Control": "no-store, private, max-age=0" };
  const reply = (body: object, status = 200) =>
    Response.json(body, { status, headers });
  if (!options.secret) return reply({ status: "not_configured" }, 503);

  const actual = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${options.secret}`);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
    return reply({ status: "unauthorized" }, 401);

  const now = (options.now ?? Date.now)();
  if (now >= Date.parse(HEARTBEAT_END))
    return reply({ status: "expired", endsAt: HEARTBEAT_END });

  const checkedAt = new Date(now).toISOString();
  try {
    await options.update(checkedAt);
    return reply({ status: "updated", checkedAt, endsAt: HEARTBEAT_END });
  } catch {
    // Do not return database errors or credentials to the caller.
    return reply({ status: "unavailable" }, 503);
  }
}
