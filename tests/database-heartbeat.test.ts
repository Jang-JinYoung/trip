import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { handleDatabaseHeartbeat } from "../src/lib/database-heartbeat";

const secret = randomBytes(32).toString("hex");
const request = (authorization: string = `Bearer ${secret}`) =>
  new Request("https://trip.test/api/cron/database-heartbeat", {
    headers: { authorization },
  });

test("인증이 없거나 설정이 없으면 DB를 호출하지 않는다", async () => {
  let calls = 0;
  const update = async () => {
    calls++;
  };
  for (const authorization of [
    "",
    "Bearer wrong",
    "Bearer undefined",
    `Basic ${secret}`,
  ]) {
    const response = await handleDatabaseHeartbeat(request(authorization), {
      secret,
      update,
    });
    assert.equal(response.status, 401);
  }
  const response = await handleDatabaseHeartbeat(request(), {
    secret: undefined,
    update,
  });
  assert.equal(response.status, 503);
  assert.equal(calls, 0);
});

test("한국 시간 11월 17일까지 갱신하고 18일 0시부터 다음 해에도 DB를 호출하지 않는다", async () => {
  const updates: string[] = [];
  const update = async (at: string) => {
    updates.push(at);
  };
  const before = Date.parse("2026-11-17T23:59:59.999+09:00");
  const active = await handleDatabaseHeartbeat(request(), {
    secret,
    update,
    now: () => before,
  });
  assert.equal(active.status, 200);
  assert.equal((await active.json()).status, "updated");
  assert.deepEqual(updates, [new Date(before).toISOString()]);
  for (const time of [
    "2026-11-18T00:00:00+09:00",
    "2027-10-28T09:00:00+09:00",
  ]) {
    const expired = await handleDatabaseHeartbeat(request(), {
      secret,
      update,
      now: () => Date.parse(time),
    });
    assert.equal((await expired.json()).status, "expired");
    assert.match(expired.headers.get("cache-control")!, /no-store/);
  }
  assert.equal(updates.length, 1);
});

test("DB 장애는 실패 상태로 보고하고 내부 정보를 노출하지 않는다", async () => {
  const response = await handleDatabaseHeartbeat(request(), {
    secret,
    now: () => Date.parse("2026-11-01T00:00:00Z"),
    update: async () => {
      throw new Error("private database details");
    },
  });
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { status: "unavailable" });
  assert.match(response.headers.get("cache-control")!, /no-store/);
});
