export type MapPermit = {
  allowed: boolean;
  reason:
    | "allowed"
    | "limit_reached"
    | "not_configured"
    | "month_rollover"
    | "unavailable";
  expiresAt?: string;
};

export function parseMapPermit(value: unknown, now = Date.now()): MapPermit {
  if (value && typeof value === "object") {
    const data = value as Record<string, unknown>;
    if (
      data.allowed === true &&
      data.reason === "allowed" &&
      typeof data.expiresAt === "string"
    ) {
      const expires = Date.parse(data.expiresAt);
      if (Number.isFinite(expires) && expires > now && expires <= now + 30000)
        return { allowed: true, reason: "allowed", expiresAt: data.expiresAt };
    }
    if (
      data.allowed === false &&
      ["limit_reached", "not_configured", "month_rollover"].includes(
        String(data.reason),
      )
    )
      return { allowed: false, reason: data.reason as MapPermit["reason"] };
  }
  return { allowed: false, reason: "unavailable" };
}

export async function requestMapPermit(
  fetcher: typeof fetch = fetch,
): Promise<MapPermit> {
  try {
    const response = await fetcher("/api/maps/reserve", {
      method: "POST",
      cache: "no-store",
      credentials: "same-origin",
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) return { allowed: false, reason: "unavailable" };
    return parseMapPermit(await response.json());
  } catch {
    return { allowed: false, reason: "unavailable" };
  }
}
