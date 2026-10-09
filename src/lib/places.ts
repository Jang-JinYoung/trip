export type Place = {
  kind?: "place" | "information";
  id: string;
  sourceId: string;
  name: string;
  region: string;
  category: string;
  description: string;
  address: string;
  price: string;
  hours: string;
  caution: string;
  evidence: string;
  status: string;
  priority: string;
  day: string;
  sourceUrl: string;
  mapUrl: string;
  note: string;
  lat: number | null;
  lng: number | null;
  locationInfo?: {
    precision: "address" | "venue" | "area";
    label: string;
    sourceUrl: string;
  };
  instagramSources?: { url: string; caption: string; addedAt: string }[];
};
export const statuses = [
  "방문 후보",
  "꼭 가기",
  "방문 완료",
  "추가 확인",
  "보류",
];
export const priorities = ["미정", "높음", "보통", "낮음"];
export function locationLabel(p: Place) {
  if (!hasCoordinates(p)) return "위치 미지정";
  if (p.locationInfo?.precision === "address") return "주소 기준 위치";
  if (p.locationInfo?.precision === "area") return "지역·경로 대표 위치";
  return "위치 지정됨";
}
export function safeUrl(value: string) {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}
export function hasCoordinates(
  p: Pick<Place, "lat" | "lng" | "kind">,
): boolean {
  return (
    p.kind !== "information" &&
    p.lat !== null &&
    p.lng !== null &&
    Number.isFinite(p.lat) &&
    Number.isFinite(p.lng) &&
    Math.abs(p.lat) <= 90 &&
    Math.abs(p.lng) <= 180
  );
}
export function blankPlace(): Place {
  return {
    id: crypto.randomUUID(),
    sourceId: "",
    name: "",
    region: "",
    category: "기타",
    description: "",
    address: "",
    price: "",
    hours: "",
    caution: "",
    evidence: "",
    status: "방문 후보",
    priority: "미정",
    day: "",
    sourceUrl: "",
    mapUrl: "",
    note: "",
    lat: null,
    lng: null,
  };
}
const aliases: Record<string, string[]> = {
  kind: ["항목유형", "kind"],
  sourceId: ["장소ID", "ID"],
  name: ["장소·상호", "장소명", "상호명", "이름", "name"],
  region: ["권역", "지역", "region"],
  category: ["분류", "카테고리", "category"],
  description: ["내용 요약 (원문 기반)", "내용", "설명", "description"],
  address: ["주소·위치 (원문)", "주소", "address"],
  price: ["가격 (게시물 당시)", "가격"],
  hours: ["시간 (게시물 당시)", "영업시간"],
  caution: ["주의·미확인 사항", "주의사항"],
  evidence: ["정보 근거"],
  status: ["방문상태", "상태"],
  priority: ["내 우선순위", "우선순위"],
  day: ["희망일", "방문일"],
  sourceUrl: ["인스타 원본 URL", "원본 URL", "링크"],
  mapUrl: ["지도 검색 URL", "지도 URL"],
  note: ["메모", "note"],
  lat: ["위도", "latitude", "lat"],
  lng: ["경도", "longitude", "lng", "lon"],
};
type Cell = unknown;
const normalize = (s: string) => s.replace(/\s/g, "").toLowerCase();
export function parseRows(rows: Cell[][]): {
  places: Place[];
  skipped: number;
} {
  const headerIndex = rows.findIndex((row) =>
    row.some((c) =>
      aliases.name.some((a) => normalize(a) === normalize(String(c ?? ""))),
    ),
  );
  if (headerIndex < 0)
    throw new Error(
      "장소명 또는 장소·상호 열을 찾지 못했습니다. 장소목록 시트를 확인해 주세요.",
    );
  const header = rows[headerIndex].map((c) => normalize(String(c ?? "")));
  const columns = Object.fromEntries(
    Object.entries(aliases).map(([key, names]) => [
      key,
      header.findIndex((h) => names.some((n) => normalize(n) === h)),
    ]),
  );
  const places: Place[] = [];
  let skipped = 0;
  for (const row of rows.slice(headerIndex + 1)) {
    if (row.every((c) => c === null || c === "")) continue;
    const get = (k: string) => {
      const c = row[columns[k]];
      return c instanceof Date
        ? c.toISOString().slice(0, 10)
        : String(c ?? "").trim();
    };
    if (!get("name")) {
      skipped++;
      continue;
    }
    const p = blankPlace();
    for (const key of Object.keys(aliases)) {
      if (key !== "lat" && key !== "lng" && key !== "kind")
        (p as unknown as Record<string, unknown>)[key] =
          get(key) || (p as unknown as Record<string, unknown>)[key];
    }
    p.kind = ["information", "여행 정보"].includes(get("kind"))
      ? "information"
      : "place";
    p.lat = get("lat") ? Number(get("lat")) : null;
    p.lng = get("lng") ? Number(get("lng")) : null;
    if (!hasCoordinates(p)) {
      p.lat = null;
      p.lng = null;
    }
    p.sourceUrl = safeUrl(p.sourceUrl);
    p.mapUrl = safeUrl(p.mapUrl);
    places.push(p);
  }
  if (!places.length) throw new Error("가져올 장소가 없습니다.");
  return { places, skipped };
}
export function mergePlaces(current: Place[], incoming: Place[]) {
  const key = (p: Place) =>
    `${p.kind ?? "place"}|${p.name.trim().toLowerCase()}|${p.address.trim().toLowerCase()}|${p.region.trim()}`;
  const places = [...current];
  const positions = new Map(places.map((p, index) => [key(p), index]));
  let duplicates = 0;
  let located = 0;
  for (const p of incoming) {
    const k = key(p);
    const index = positions.get(k);
    if (index !== undefined) {
      duplicates++;
      if (!hasCoordinates(places[index]) && hasCoordinates(p)) {
        places[index] = {
          ...places[index],
          lat: p.lat,
          lng: p.lng,
          locationInfo: p.locationInfo,
        };
        located++;
      }
      continue;
    }
    positions.set(k, places.length);
    places.push(p);
  }
  return { places, duplicates, located };
}
export function csvExport(places: Place[]) {
  const fields = Object.keys(aliases) as (keyof Place)[];
  const escape = (v: unknown) => {
    let s = String(v ?? "");
    if (/^[=+@\-\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replaceAll('"', '""') + '"';
  };
  return (
    "\uFEFF" +
    [
      [...fields.map((k) => aliases[k][0]), "추가 Instagram 출처"],
      ...places.map((p) => [
        ...fields.map((k) => p[k]),
        JSON.stringify(p.instagramSources ?? []),
      ]),
    ]
      .map((r) => r.map(escape).join(","))
      .join("\r\n")
  );
}
