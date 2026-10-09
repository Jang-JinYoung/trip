import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createGoogleMapMarkers,
  type MapPoint,
} from "../src/lib/google-map-markers";

test("마커 선택은 기존 마커를 유지하며 장소 ID를 전달하고 색상만 변경한다", (t) => {
  let styleWrites = 0;
  class Pin {
    private color = "";
    private size = 1;
    get background() {
      return this.color;
    }
    set background(value: string) {
      this.color = value;
      styleWrites++;
    }
    get scale() {
      return this.size;
    }
    set scale(value: number) {
      this.size = value;
      styleWrites++;
    }
  }
  const instances: Marker[] = [];
  class Marker extends EventTarget {
    map: unknown;
    position: unknown;
    title = "";
    private order = 0;
    get zIndex() {
      return this.order;
    }
    set zIndex(value: number) {
      this.order = value;
      styleWrites++;
    }
    pin?: Pin;
    constructor(options: object) {
      super();
      Object.assign(this, options);
      instances.push(this);
    }
    append(pin: Pin) {
      this.pin = pin;
    }
  }
  const original = Object.getOwnPropertyDescriptor(globalThis, "google");
  Object.defineProperty(globalThis, "google", {
    configurable: true,
    value: {
      maps: { marker: { PinElement: Pin, AdvancedMarkerElement: Marker } },
    },
  });
  t.after(() => {
    if (original) Object.defineProperty(globalThis, "google", original);
    else Reflect.deleteProperty(globalThis, "google");
  });
  const map = {} as google.maps.Map;
  const selected: string[] = [];
  const controller = createGoogleMapMarkers(map, (id) => selected.push(id));
  const points: MapPoint[] = [
    { id: "a", lat: 22.3, lng: 114.1, title: "A" },
    { id: "b", lat: 22.4, lng: 114.2, title: "B" },
    ...Array.from({ length: 119 }, (_, i) => ({
      id: `extra-${i}`,
      lat: 22.3,
      lng: 114.1 + i / 10000,
      title: `장소 ${i}`,
    })),
  ];
  controller.update(points, null);
  const [first, second] = instances;
  first.dispatchEvent(new Event("gmp-click"));
  styleWrites = 0;
  controller.update(
    points.map((p) => ({ ...p })),
    "a",
  );
  assert.equal(
    styleWrites,
    3,
    "121개 중 새로 선택한 마커 하나의 스타일만 갱신한다",
  );
  styleWrites = 0;
  second.dispatchEvent(new Event("gmp-click"));
  controller.update(points, "b");
  assert.equal(styleWrites, 6, "선택 전환은 이전/다음 마커 두 개만 갱신한다");
  styleWrites = 0;
  controller.update(
    points.map((p) => ({ ...p })),
    "b",
  );
  assert.equal(
    styleWrites,
    0,
    "같은 선택과 데이터로 다시 렌더해도 DOM 스타일을 쓰지 않는다",
  );
  assert.deepEqual(selected, ["a", "b"]);
  assert.equal(
    instances.length,
    121,
    "선택할 때 전체 마커를 재생성하지 않는다",
  );
  assert.equal(first.map, map);
  assert.equal(second.map, map);
  assert.equal(first.pin?.background, "#4565ef");
  assert.equal(second.pin?.background, "#e7a64b");
  assert.equal(second.zIndex, 1000);

  controller.update([{ ...points[1], lat: 22.5, title: "수정된 B" }], "b");
  assert.equal(instances.length, 121);
  assert.deepEqual(second.position, { lat: 22.5, lng: 114.2 });
  assert.equal(second.title, "수정된 B");
  assert.equal(first.map, null);
  first.dispatchEvent(new Event("gmp-click"));
  assert.deepEqual(
    selected,
    ["a", "b"],
    "필터로 제거된 마커의 리스너도 정리한다",
  );
  controller.dispose();
  assert.equal(second.map, null);
  second.dispatchEvent(new Event("gmp-click"));
  assert.deepEqual(selected, ["a", "b"]);
});
