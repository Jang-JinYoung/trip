import { test } from "node:test";
import assert from "node:assert/strict";
import { loginEmail } from "../src/lib/login";

test("admin 아이디는 기존 계정으로 연결하고 일반 이메일은 유지한다", () => {
  assert.equal(loginEmail(" Admin "), "admin@trip.local");
  assert.equal(loginEmail("user@example.com"), "user@example.com");
});
