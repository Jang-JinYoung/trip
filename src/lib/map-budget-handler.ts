import { parseMapPermit } from "./map-budget";

export async function handleMapReservation(
  request: Request,
  reserve: () => Promise<unknown>,
) {
  const headers = { "Cache-Control": "no-store, private, max-age=0" };
  const origin = request.headers.get("origin");
  if (
    origin !== new URL(request.url).origin ||
    request.headers.get("sec-fetch-site") === "cross-site"
  )
    return Response.json(
      { allowed: false, reason: "unavailable" },
      { status: 403, headers },
    );
  try {
    return Response.json(parseMapPermit(await reserve()), { headers });
  } catch {
    return Response.json(
      { allowed: false, reason: "unavailable" },
      { status: 503, headers },
    );
  }
}
