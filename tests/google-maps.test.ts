import { test } from "node:test";
import assert from "node:assert/strict";
import { blankPlace } from "../src/lib/places";
import { googleMapsUrl, myMapsCsvExport } from "../src/lib/google-maps";

test("Google 지도 링크는 기존 Google 링크 또는 유효 좌표/검색어를 사용한다", () => {
  const place = {
    ...blankPlace(),
    name: "카페 & 디저트",
    address: "1 Main St",
    region: "홍콩",
  };
  assert.equal(
    new URL(googleMapsUrl(place)).searchParams.get("query"),
    "카페 & 디저트 1 Main St 홍콩",
  );
  place.lat = -33.86;
  place.lng = 151.2;
  assert.equal(
    new URL(googleMapsUrl(place)).searchParams.get("query"),
    "-33.86,151.2",
  );
  place.mapUrl = "https://maps.app.goo.gl/example";
  assert.equal(googleMapsUrl(place), place.mapUrl);
  for (const url of [
    "javascript:alert(1)",
    "https://google.com.evil.test/maps",
    "https://example.com/",
  ]) {
    place.mapUrl = url;
    assert.equal(new URL(googleMapsUrl(place)).hostname, "www.google.com");
  }
});

test("My Maps 내보내기는 좌표 있는 장소만 포함하고 메모·정확도·출처를 보존한다", () => {
  const place = {
    ...blankPlace(),
    id: "stable-id",
    name: '카페, "A"',
    lat: -33.86,
    lng: -151.2,
    note: "첫 줄\n둘째 줄",
    sourceUrl: "https://www.instagram.com/reel/example/",
    locationInfo: {
      precision: "area" as const,
      label: "지역 대표",
      sourceUrl: "https://example.com",
    },
  };
  const csv = myMapsCsvExport([
    place,
    { ...place, id: "no-coords", name: "위치없음", lat: null },
    { ...place, id: "info", name: "여행팁", kind: "information" },
    { ...place, id: "bad", name: "잘못된위치", lat: 91 },
  ]);
  assert.ok(csv.startsWith('\uFEFF"ID","장소명","위도","경도"'));
  assert.match(csv, /"stable-id","카페, ""A""","-33\.86","-151\.2"/);
  assert.ok(csv.includes('"첫 줄\n둘째 줄"'));
  assert.ok(csv.includes("지역·경로 대표 위치"));
  assert.ok(csv.includes(place.sourceUrl));
  assert.doesNotMatch(csv, /위치없음|여행팁|잘못된위치/);
});

test("CSV는 텍스트 수식 실행을 막으면서 음수 좌표와 빈 내보내기를 유지한다", () => {
  const place = {
    ...blankPlace(),
    name: "=1+1",
    lat: 0,
    lng: -1,
    note: '  =HYPERLINK("bad")',
  };
  const csv = myMapsCsvExport([place]);
  assert.ok(csv.includes('"\'=1+1"'));
  assert.ok(csv.includes('"\'  =HYPERLINK(""bad"")"'));
  assert.ok(csv.includes('"0","-1"'));
  assert.equal(myMapsCsvExport([]).split("\r\n").length, 1);
});
