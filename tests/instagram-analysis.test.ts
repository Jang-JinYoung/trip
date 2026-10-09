import { test } from "node:test";
import assert from "node:assert/strict";
import {
  analyzeInstagramCaption,
  cleanCaption,
  createInstagramInformation,
  createInstagramPlaces,
  findInstagramMatches,
  normalizeReelUrl,
} from "../src/lib/instagram-analysis";
import { extractPublicCaption } from "../src/lib/instagram";
import {
  blankPlace,
  hasCoordinates,
  mergePlaces,
  parseRows,
  csvExport,
} from "../src/lib/places";

const url = "https://www.instagram.com/reel/ABC123/";
test("릴스만 받아 추적 쿼리를 정리하고 일반 게시물은 구분한다", () => {
  assert.equal(
    normalizeReelUrl("https://instagram.com/reels/ABC123/?igsh=abc"),
    url,
  );
  assert.throws(() => normalizeReelUrl("https://instagram.com/p/ABC123/"));
  assert.throws(() =>
    normalizeReelUrl("https://instagram.com.evil.example/reel/ABC123/"),
  );
});
test("여러 장소와 주소 줄을 구분하고 각 장소의 설명 블록을 사용한다", () => {
  const result = analyzeInstagramCaption(
    "홍콩 저장 리스트\n📍 Halfway Coffee\n주소: 12 Tung Street\n영업시간: 9–18\n📍 Hop Yik Tai\n📍 121 Kweilin Street\n완탕면 식당",
  );
  assert.equal(result.kind, "place");
  assert.deepEqual(
    result.candidates.map((p) => p.name),
    ["Halfway Coffee", "Hop Yik Tai"],
  );
  assert.equal(result.candidates[0].address, "12 Tung Street");
  assert.equal(result.candidates[0].hours, "9–18");
  assert.equal(result.candidates[1].address, "121 Kweilin Street");
  assert.equal(result.candidates[1].hours, "");
});
test("팁 목록·주소만 있는 설명을 가짜 장소로 만들지 않는다", () => {
  for (const caption of [
    "홍콩 교통 꿀팁\n1. 옥토퍼스 카드 준비\n2. 공항에서 충전",
    "📌 여행 준비물\n여권과 충전기를 챙기세요",
    "📍 주소: 12 Tung Street",
    "맛있는 카페를 찾았어요",
  ]) {
    const result = analyzeInstagramCaption(caption);
    assert.equal(result.kind, "information");
    assert.equal(result.candidates.length, 0);
  }
  assert.equal(analyzeInstagramCaption("").kind, "unknown");
  const numbered = analyzeInstagramCaption(
    "1. Bakehouse\n주소: 5 Staunton Street\n2. Test Cafe\n주소: 1 Test Road",
  );
  assert.equal(numbered.candidates.length, 2);
});
test("공개 캡션의 계정·날짜 포장을 제거하고 JSON-LD도 읽는다", () => {
  assert.equal(
    cleanCaption(
      '123 likes, 4 comments - user on March 1, 2026: "📍 Test Cafe\n주소: 1 Test Road".',
    ),
    "📍 Test Cafe\n주소: 1 Test Road",
  );
  assert.equal(
    extractPublicCaption(
      '<script type="application/ld+json">{"@type":"VideoObject","description":"📍 Test Cafe"}</script>',
    ),
    "📍 Test Cafe",
  );
  assert.equal(
    extractPublicCaption(
      '<script type="application/ld+json">broken</script><meta property="og:description" content="교통 팁">',
    ),
    "교통 팁",
  );
});
test("여행 정보·확인 대기 링크를 장소와 구분해 저장하고 재가져오기는 중복을 방지한다", () => {
  const caption = "홍콩 교통 꿀팁\n옥토퍼스 카드를 준비하세요.";
  const analysis = analyzeInstagramCaption(caption);
  const info = createInstagramInformation(url, caption, analysis);
  assert.equal(info.kind, "information");
  assert.equal(info.name, "홍콩 교통 꿀팁");
  assert.equal(info.description, caption);
  assert.equal(hasCoordinates({ ...info, lat: 22.3, lng: 114.1 }), false);
  const saved = JSON.parse(JSON.stringify(info));
  const repeated = createInstagramInformation(
    url + "?igsh=test",
    caption,
    analysis,
    saved,
  );
  assert.equal(repeated.id, info.id);
  assert.equal(repeated.instagramSources?.length, 1);
  assert.equal(findInstagramMatches([info], url + "?igsh=test").length, 1);
  const pending = createInstagramInformation(
    url,
    "",
    analyzeInstagramCaption(""),
  );
  assert.equal(pending.status, "추가 확인");
  assert.equal(pending.description, "");
  const resolved = createInstagramInformation(url, caption, analysis, pending);
  assert.equal(resolved.id, pending.id);
  assert.equal(resolved.name, "홍콩 교통 꿀팁");
  const similarPlace = { ...blankPlace(), name: info.name };
  assert.equal(mergePlaces([similarPlace], [info]).places.length, 2);
  assert.match(csvExport([info]), /information/);
  const imported = parseRows([
    ["항목유형", "장소명", "위도", "경도"],
    ["information", "교통 팁", 22.3, 114.1],
  ]).places[0];
  assert.equal(imported.kind, "information");
  assert.equal(imported.lat, null);
});

test("상호 하나와 지점별 핀 주소를 분리하고 기존 엑셀 장소에 출처를 연결한다", () => {
  const caption =
    "샌드위치 소개\n新香園\n📍 Mong Kok — Shop 7, G/F, Hung Wai Building, 3-5 Fa Yuen Street, Mong Kok\n📍 Sham Shui Po — G/F, 186 Yu Chau Street, Sham Shui Po";
  const analysis = analyzeInstagramCaption(caption);
  assert.equal(analysis.kind, "place");
  assert.equal(analysis.candidates.length, 2);
  assert.equal(analysis.candidates[0].name, "新香園 — Mong Kok");
  assert.match(analysis.candidates[1].address, /^G\/F, 186/);
  const old = {
    ...blankPlace(),
    name: "新香園 — 몽콕점",
    sourceUrl: url,
    address: analysis.candidates[0].address,
    note: "점심에 방문",
    lat: 22.3163,
    lng: 114.1715,
  };
  const saved = createInstagramPlaces([old], url, caption, analysis.candidates);
  assert.equal(saved.length, 2);
  assert.equal(saved[0].id, old.id);
  assert.equal(saved[0].name, old.name);
  assert.equal(saved[0].note, old.note);
  assert.equal(saved[0].lat, old.lat);
  const repeated = createInstagramPlaces(
    saved,
    url,
    caption,
    analysis.candidates,
  );
  assert.deepEqual(
    repeated.map((p) => p.id),
    saved.map((p) => p.id),
  );
  assert.ok(repeated.every((p) => p.instagramSources?.length === 1));
  assert.equal(
    createInstagramPlaces([], url, caption, [
      analysis.candidates[0],
      analysis.candidates[0],
    ]).length,
    1,
  );
});
