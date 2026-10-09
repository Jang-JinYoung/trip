import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeInstagramUrl,
  extractInstagramFields,
  extractPublicCaption,
  attachInstagram,
  sameInstagramPost,
} from "../src/lib/instagram";
import { fetchInstagramPreview } from "../src/lib/instagram-fetch";
import { blankPlace, csvExport } from "../src/lib/places";

test("Instagram 게시물 URL만 허용하고 추적 쿼리를 정리한다", () => {
  assert.equal(
    normalizeInstagramUrl("https://instagram.com/reel/ABC123_/?igsh=x"),
    "https://www.instagram.com/reel/ABC123_/",
  );
  assert.ok(
    sameInstagramPost(
      "https://instagram.com/p/ABC123_",
      "https://www.instagram.com/reel/ABC123_/?id=1",
    ),
  );
  for (const url of [
    "https://instagram.com.evil.com/p/ABC123/",
    "https://localhost/p/ABC123/",
    "http://instagram.com/p/ABC123/",
    "https://evil@instagram.com/p/ABC123/",
    "https://instagram.com/accounts/login/",
    "https://instagram.com:8080/p/ABC123/",
    "https://instagram.com/share/ABC123/",
  ])
    assert.throws(() => normalizeInstagramUrl(url));
});
test("명시된 장소 항목만 추출하고 좌표나 장소명을 추측하지 않는다", () => {
  const fields = extractInstagramFields(
    "홍콩에서 좋아하는 카페\n📍 장소명: Halfway Coffee\n주소: 12 Street\n영업시간: 09:00–18:00",
  );
  assert.equal(fields.name, "Halfway Coffee");
  assert.equal(fields.address, "12 Street");
  assert.equal(fields.region, "");
  assert.equal(extractInstagramFields("Halfway Coffee 맛있어요!").name, "");
});
test("공개 메타데이터의 HTML 엔티티를 복원하고 로그인 안내는 제외한다", () => {
  assert.equal(
    extractPublicCaption(
      '<meta content="장소명: A &amp; B&#10;주소: 1 Street" property="og:description">',
    ),
    "장소명: A & B\n주소: 1 Street",
  );
  assert.equal(
    extractPublicCaption(
      '<meta name="description" content="Log in to see photos">',
    ),
    "",
  );
  assert.equal(extractPublicCaption("<script>alert(1)</script>"), "");
});
test("새 장소 생성 및 기존 값/출처를 보존하는 연결과 중복 방지", () => {
  const url = "https://www.instagram.com/p/ABC123/";
  const fields = extractInstagramFields("장소명: 새 카페\n주소: 새 주소");
  const created = attachInstagram(null, url, "본문", fields);
  assert.equal(created.name, "새 카페");
  assert.equal(created.lat, null);
  const existing = {
    ...blankPlace(),
    name: "기존 카페",
    address: "기존 주소",
    note: "내 메모",
    sourceUrl: "https://example.com/original",
    description: "기존 소개",
  };
  const updated = attachInstagram(existing, url, "본문", fields);
  assert.equal(updated.address, "기존 주소");
  assert.equal(updated.note, "내 메모");
  assert.equal(updated.sourceUrl, existing.sourceUrl);
  assert.equal(updated.description, "기존 소개");
  const repeated = attachInstagram(updated, url + "?igsh=foo", "본문", fields);
  assert.equal(repeated.instagramSources?.length, 1);
  assert.equal(repeated.instagramSources?.[0].caption, "본문");
  assert.equal(existing.instagramSources, undefined);
  assert.match(csvExport([repeated]), /추가 Instagram 출처/);
  assert.throws(() =>
    attachInstagram(null, url, "본문", extractInstagramFields("")),
  );
});
test("공개 HTML 응답은 설명을 반환하고 차단/리디렉션/대용량은 수동 입력으로 전환한다", async () => {
  const url = "https://www.instagram.com/p/ABC123/";
  const fetcher = (response: Response) =>
    (async () => response) as typeof fetch;
  const result = await fetchInstagramPreview(
    url,
    fetcher(
      new Response(
        '<meta property="og:description" content="장소명: 테스트 카페">',
        { headers: { "content-type": "text/html" } },
      ),
    ),
  );
  assert.equal(result.status, "available");
  assert.match(result.caption, /테스트/);
  for (const response of [
    new Response("", { status: 403 }),
    new Response("", {
      status: 302,
      headers: { location: "http://127.0.0.1/" },
    }),
    new Response("x".repeat(1024 * 1024 + 1), {
      headers: { "content-type": "text/html" },
    }),
  ])
    assert.equal(
      (await fetchInstagramPreview(url, fetcher(response))).status,
      "manual",
    );
  let called = false;
  await assert.rejects(
    fetchInstagramPreview("https://localhost/", (async () => {
      called = true;
      return new Response();
    }) as typeof fetch),
  );
  assert.equal(called, false);
});
