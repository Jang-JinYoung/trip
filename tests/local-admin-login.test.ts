import { test } from "node:test";
import assert from "node:assert/strict";
import { handleLocalAdminLogin } from "../src/lib/local-admin-login";
import { loginEmail } from "../src/lib/login";

function request(origin = "http://localhost:3001", password = "admin") {
  return new Request("http://localhost:3001/api/auth/local-admin", {
    method: "POST",
    headers: { origin },
    body: JSON.stringify({ username: "admin", password }),
  });
}
test("admin 별칭은 기존 계정으로 연결하고 일반 이메일은 유지한다", () => {
  assert.equal(loginEmail(" Admin "), "admin@trip.local");
  assert.equal(loginEmail("user@example.com"), "user@example.com");
});
test("간편 로그인은 운영 환경·외부 출처·잘못된 비밀번호에서 실제 인증을 실행하지 않는다", async () => {
  let calls = 0;
  const login = async () => {
    calls++;
    return { access_token: "test-access", refresh_token: "test-refresh" };
  };
  assert.equal(
    (await handleLocalAdminLogin(request(), false, login)).status,
    404,
  );
  assert.equal(
    (await handleLocalAdminLogin(request("https://other.test"), true, login))
      .status,
    403,
  );
  assert.equal(
    (
      await handleLocalAdminLogin(
        request("http://localhost:3001", "wrong"),
        true,
        login,
      )
    ).status,
    401,
  );
  assert.equal(
    (
      await handleLocalAdminLogin(
        new Request("https://trip.test/api/auth/local-admin"),
        true,
        login,
      )
    ).status,
    404,
  );
  assert.equal(calls, 0);
  const result = await handleLocalAdminLogin(request(), true, login);
  assert.equal(result.status, 200);
  assert.equal(calls, 1);
  assert.match(result.headers.get("cache-control")!, /no-store/);
});
test("인증 오류의 내부 정보는 응답에 노출하지 않는다", async () => {
  const response = await handleLocalAdminLogin(request(), true, async () => {
    throw Error("private-password-details");
  });
  assert.equal(response.status, 503);
  assert.doesNotMatch(await response.text(), /private-password-details/);
});
