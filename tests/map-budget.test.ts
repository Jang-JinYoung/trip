import { test } from "node:test";
import assert from "node:assert/strict";
import { parseMapPermit, requestMapPermit } from "../src/lib/map-budget";
import { handleMapReservation } from "../src/lib/map-budget-handler";

test("허용 응답과 만료 시간이 모두 유효할 때만 Google 지도를 허용한다", () => {
  const now = Date.now();
  const allowed = {
    allowed: true,
    reason: "allowed",
    expiresAt: new Date(now + 15000).toISOString(),
  };
  assert.equal(parseMapPermit(allowed, now).allowed, true);
  for (const value of [
    null,
    {},
    { allowed: "true" },
    { ...allowed, expiresAt: "bad" },
    { ...allowed, expiresAt: new Date(now - 1).toISOString() },
    { ...allowed, expiresAt: new Date(now + 60000).toISOString() },
  ])
    assert.equal(parseMapPermit(value, now).allowed, false);
  assert.equal(
    parseMapPermit({ allowed: false, reason: "limit_reached" }).reason,
    "limit_reached",
  );
});

test("예약 API의 오류·타임아웃·잘못된 응답에서는 Google 호출을 허용하지 않는다", async () => {
  const results = await Promise.all([
    requestMapPermit(async () => {
      throw new Error("offline");
    }),
    requestMapPermit(async () => new Response("bad", { status: 503 })),
    requestMapPermit(async () => new Response("not-json")),
    requestMapPermit(async () => Response.json({ allowed: true })),
  ]);
  assert.ok(results.every((r) => !r.allowed));
  let calls = 0;
  const permit = await requestMapPermit(async (url, options) => {
    calls++;
    assert.equal(url, "/api/maps/reserve");
    assert.equal(options?.method, "POST");
    assert.equal(options?.cache, "no-store");
    return Response.json({ allowed: false, reason: "limit_reached" });
  });
  assert.equal(calls, 1);
  assert.equal(permit.reason, "limit_reached");
});

test("다른 사이트의 요청은 집계 전에 거부하고 DB 오류도 차단하며 응답을 캐시하지 않는다", async () => {
  let reservations = 0;
  const reserve = async () => {
    reservations++;
    return { allowed: false, reason: "limit_reached" };
  };
  for (const origin of [undefined, "https://other.test"]) {
    const response = await handleMapReservation(
      new Request("https://trip.test/api/maps/reserve", {
        method: "POST",
        headers: origin ? { origin } : {},
      }),
      reserve,
    );
    assert.equal(response.status, 403);
  }
  assert.equal(reservations, 0);
  const request = new Request("https://trip.test/api/maps/reserve", {
    method: "POST",
    headers: { origin: "https://trip.test" },
  });
  const limited = await handleMapReservation(request, reserve);
  assert.equal(reservations, 1);
  assert.equal((await limited.json()).reason, "limit_reached");
  assert.match(limited.headers.get("cache-control")!, /no-store/);
  const failed = await handleMapReservation(request, async () => {
    throw new Error("private DB details");
  });
  assert.equal(failed.status, 503);
  assert.deepEqual(await failed.json(), {
    allowed: false,
    reason: "unavailable",
  });
});
