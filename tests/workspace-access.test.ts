import { test } from "node:test";
import assert from "node:assert/strict";
import type { User } from "@supabase/supabase-js";
import { blankPlace } from "../src/lib/places";
import {
  createWorkspaceAccess,
  type WorkspaceAccess,
} from "../src/lib/workspace-access";

const user = (id: string) => ({ id }) as User;
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

test("로그인하지 않으면 DB를 읽지 않고 장소 없는 로그인 상태만 전달한다", async () => {
  let reads = 0;
  const states: WorkspaceAccess[] = [];
  const access = createWorkspaceAccess(
    async (id) => {
      reads++;
      return { user: user(id), places: [] };
    },
    (state) => states.push(state),
  );
  await access.change(null);
  assert.equal(reads, 0);
  assert.deepEqual(states, [{ status: "signed-out" }]);
  await access.change("alice");
  await access.change("alice");
  assert.equal(reads, 1, "토큰 갱신은 편집 중인 목록을 다시 불러오지 않는다");
});

test("로그아웃 뒤에 도착한 이전 계정의 DB 응답을 버린다", async () => {
  const pending = deferred<{
    user: User;
    places: ReturnType<typeof blankPlace>[];
  }>();
  const states: WorkspaceAccess[] = [];
  const access = createWorkspaceAccess(
    () => pending.promise,
    (state) => states.push(state),
  );
  const loading = access.change("alice");
  await access.change(null);
  pending.resolve({
    user: user("alice"),
    places: [{ ...blankPlace(), name: "private" }],
  });
  await loading;
  assert.deepEqual(states, [{ status: "loading" }, { status: "signed-out" }]);
});

test("계정 전환 시 이전 계정의 늦은 응답이 새 계정의 목록을 덮지 않는다", async () => {
  const pending = deferred<{
    user: User;
    places: ReturnType<typeof blankPlace>[];
  }>();
  const states: WorkspaceAccess[] = [];
  const access = createWorkspaceAccess(
    (id) =>
      id === "alice"
        ? pending.promise
        : Promise.resolve({ user: user(id), places: [] }),
    (state) => states.push(state),
  );
  const first = access.change("alice");
  await access.change("bob");
  pending.resolve({ user: user("alice"), places: [blankPlace()] });
  await first;
  assert.deepEqual(states.at(-1), {
    status: "ready",
    user: user("bob"),
    places: [],
  });
  assert.equal(states.filter((state) => state.status === "ready").length, 1);
});

test("인증 불일치·DB 오류·언마운트는 장소 노출 없이 종료한다", async () => {
  for (const load of [
    async () => {
      throw Error("DB unavailable");
    },
    async () => ({ user: user("wrong-user"), places: [blankPlace()] }),
  ]) {
    const states: WorkspaceAccess[] = [];
    const access = createWorkspaceAccess(load, (state) => states.push(state));
    await access.change("alice");
    assert.equal(states.at(-1)?.status, "error");
    assert.ok(states.every((state) => state.status !== "ready"));
  }
  const pending = deferred<{
    user: User;
    places: ReturnType<typeof blankPlace>[];
  }>();
  const states: WorkspaceAccess[] = [];
  const access = createWorkspaceAccess(
    () => pending.promise,
    (state) => states.push(state),
  );
  const result = access.change("alice");
  access.dispose();
  pending.resolve({ user: user("alice"), places: [blankPlace()] });
  await result;
  assert.deepEqual(states, [{ status: "loading" }]);
});
