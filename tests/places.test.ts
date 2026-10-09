import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { readSheet } from "read-excel-file/node";
import {
  parseRows,
  mergePlaces,
  hasCoordinates,
  safeUrl,
  csvExport,
} from "../src/lib/places";
test(
  "기존 홍콩 엑셀의 4행 헤더와 156개 장소를 읽는다",
  {
    skip:
      !existsSync("01_instagram_DM_hongkong.xlsx") &&
      "로컬 전용 원본 엑셀이 없어 건너뜁니다.",
  },
  async () => {
    const rows = await readSheet(
      readFileSync("01_instagram_DM_hongkong.xlsx"),
      "장소목록",
    );
    const { places, skipped } = parseRows(rows);
    assert.equal(places.length, 156);
    assert.equal(skipped, 0);
    assert.equal(places[0].sourceId, "P001");
    assert.match(places[0].name, /新香園/);
    assert.match(places[0].address, /Fa Yuen/);
    assert.equal(places[0].lat, null);
    assert.equal(mergePlaces(places, parseRows(rows).places).duplicates, 156);
  },
);
test("좌표 범위, 빈 값, 위험한 링크를 검증한다", () => {
  const { places } = parseRows([
    ["장소명", "주소", "위도", "경도", "링크"],
    ["A", "주소", 22.3, 114.2, "javascript:alert(1)"],
    ["B", "주소", 91, 2, "https://example.com"],
  ]);
  assert.ok(hasCoordinates(places[0]));
  assert.equal(places[0].sourceUrl, "");
  assert.equal(places[1].lat, null);
  assert.equal(safeUrl("data:text/html,foo"), "");
  assert.throws(() => parseRows([["다른 열"], ["내용"]]));
});
test("주소가 다른 지점은 보존하고 CSV 수식 실행을 방지한다", () => {
  const { places } = parseRows([
    ["장소명", "주소", "메모"],
    ["A", "1", "hello"],
    ["A", "2", '=HYPERLINK("bad")'],
  ]);
  assert.equal(mergePlaces([], places).places.length, 2);
  assert.match(csvExport(places), /'=HYPERLINK/);
});

test("좌표를 보완해도 기존 메모·방문 상태·직접 지정한 위치는 보존한다", () => {
  const { places } = parseRows([
    ["장소명", "주소"],
    ["A", "1"],
    ["B", "2"],
  ]);
  places[0].note = "내 메모";
  places[0].status = "꼭 가기";
  places[1].lat = 22.1;
  places[1].lng = 114.1;
  const incoming = places.map((p) => ({
    ...p,
    id: crypto.randomUUID(),
    note: "",
    status: "방문 후보",
    lat: 22.3,
    lng: 114.2,
  }));
  const merged = mergePlaces(places, incoming);
  assert.equal(merged.places.length, 2);
  assert.equal(merged.duplicates, 2);
  assert.equal(merged.located, 1);
  assert.equal(merged.places[0].note, "내 메모");
  assert.equal(merged.places[0].status, "꼭 가기");
  assert.equal(merged.places[0].id, places[0].id);
  assert.equal(merged.places[0].lat, 22.3);
  assert.equal(merged.places[1].lat, 22.1);
  assert.equal(places[0].lat, null);
  assert.equal(mergePlaces(merged.places, incoming).located, 0);
});
