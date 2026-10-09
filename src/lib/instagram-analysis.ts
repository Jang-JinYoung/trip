import { blankPlace, type Place } from "./places";
import {
  attachInstagram,
  extractInstagramFields,
  normalizeInstagramUrl,
  sameInstagramPost,
  type InstagramFields,
} from "./instagram";

export type InstagramAnalysis = {
  kind: "place" | "information" | "unknown";
  title: string;
  summary: string;
  candidates: InstagramFields[];
};

export function normalizeReelUrl(input: string) {
  const url = normalizeInstagramUrl(input);
  if (!new URL(url).pathname.startsWith("/reel/"))
    throw Error(
      "Instagram 릴스 URL을 입력해 주세요. 예: https://www.instagram.com/reel/…/",
    );
  return url;
}

export function cleanCaption(input: string) {
  // Public OG descriptions can wrap the actual caption in account/date/like metadata.
  return input
    .trim()
    .replace(
      /^.{0,300}?\bon\s+(?:Instagram|[A-Za-z]+\s+\d{1,2},?\s+\d{4})\s*:\s*["“]/i,
      "",
    )
    .replace(/["”]\.?$/, "")
    .trim()
    .slice(0, 12000);
}

const addressLine = (line: string) =>
  /^(?:주소|위치|address)\s*[:：]/i.test(line) ||
  /\b(?:\d+[a-z]?(?:-\d+)?\s+.+\b(?:street|st\.?|road|rd\.?|lane|ln\.?|avenue|ave\.?|square)|G\/F|\d+\/F|Shop\s+\w+)\b/i.test(
    line,
  ) ||
  /(?:[가-힣]+(?:로|길)\s*\d+|[가-힣]+(?:시|구)\s+[가-힣]+(?:구|동)|[街路道]\s*\d+號)/.test(
    line,
  );
const nonVenue = (line: string) =>
  /(?:꿀팁|총정리|준비물|여행팁|여행 정보|환전|입국심사|교통카드|옥토퍼스|주의사항|추천\s*(?:리스트|모음)|best\s*\d+|top\s*\d+|tips|itinerary)/i.test(
    line,
  ) ||
  /^(?:홍콩|마카오|일본|한국|서울|여행|Hong Kong|Macau|Japan|주소|위치|영업시간|가격)[.!\s]*$/i.test(
    line,
  );

function categoryFor(text: string) {
  if (
    /카페|커피|디저트|베이커리|coffee|cafe|café|bakery|dessert|咖啡/i.test(text)
  )
    return "카페·디저트";
  if (
    /식당|맛집|국수|샌드위치|레스토랑|restaurant|noodle|餐廳|茶餐|bak mee/i.test(
      text,
    )
  )
    return "식당";
  if (/쇼핑|마켓|잡화|shopping|market|store/i.test(text)) return "쇼핑";
  if (/공원|전망대|박물관|관광|park|museum|temple|peak/i.test(text))
    return "관광";
  return "기타";
}

/** Conservative, deterministic classification of available caption text; no video inference. */
export function analyzeInstagramCaption(input: string): InstagramAnalysis {
  const text = cleanCaption(input);
  if (!text)
    return {
      kind: "unknown",
      title: "확인할 Instagram 릴스",
      summary: "",
      candidates: [],
    };
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const starts: { index: number; name: string; address?: string }[] = [];
  lines.forEach((line, index) => {
    const explicit = line.match(
      /^(?:📍|📌|🏠)?\s*(?:장소명|상호명|상호|장소|가게|name)\s*[:：]\s*(.+)/i,
    );
    const marked = line.match(/^(?:📍|📌|🏠)\s*(.+)/);
    const numbered = line.match(/^(?:\d{1,2}[.)]\s+|[①②③④⑤⑥⑦⑧⑨⑩]\s*)(.+)/);
    const raw =
      explicit?.[1] ??
      marked?.[1] ??
      (numbered && lines.slice(index + 1, index + 4).some(addressLine)
        ? numbered[1]
        : "");
    if (marked && addressLine(raw)) {
      const parts = raw.match(/^(.{1,70}?)\s+(?:—|–|-)\s+(.+)$/);
      // Common reel format: a bare business name followed by one pin/address per branch.
      let parent = "";
      for (
        let previous = index - 1;
        previous >= Math.max(0, index - 5);
        previous--
      ) {
        const line = lines[previous];
        if (/^(?:📍|📌|🏠)/.test(line) && addressLine(line)) continue;
        if (
          line.length <= 70 &&
          line.split(/\s+/).length <= 8 &&
          !/[.!?:：#📍📌🏠]/u.test(line) &&
          !addressLine(line) &&
          !nonVenue(line)
        )
          parent = line;
        break;
      }
      if (parent) {
        starts.push({
          index,
          name: parts ? `${parent} — ${parts[1].trim()}` : parent,
          address:
            parts?.[2].trim() ??
            raw.replace(/^(?:주소|위치|address)\s*[:：]\s*/i, ""),
        });
        return;
      }
    }
    const name = raw.replace(/\s*[|｜]\s*.*$/, "").trim();
    if (
      name &&
      name.length <= 100 &&
      !addressLine(name) &&
      !nonVenue(name) &&
      !/^https?:|^#/.test(name)
    )
      starts.push({ index, name });
  });
  // A plain title followed by an explicit address is also a useful venue signal.
  if (
    !starts.length &&
    lines.length > 1 &&
    lines[0].length <= 80 &&
    !nonVenue(lines[0]) &&
    !addressLine(lines[0]) &&
    /^(?:주소|address)\s*[:：]/i.test(lines[1])
  ) {
    starts.push({ index: 0, name: lines[0] });
  }
  const seen = new Set<string>();
  const candidates = starts
    .flatMap((start, index) => {
      const block = lines
        .slice(start.index, starts[index + 1]?.index ?? lines.length)
        .join("\n");
      const fields = extractInstagramFields(block);
      fields.name = start.name;
      if (start.address) fields.address = start.address;
      if (!fields.address)
        fields.address =
          block
            .split("\n")
            .slice(1)
            .map((line) => line.replace(/^(?:📍|📌|🏠)\s*/, ""))
            .find(addressLine)
            ?.replace(/^(?:주소|위치|address)\s*[:：]\s*/i, "") ?? "";
      if (!fields.category)
        fields.category = categoryFor(`${fields.name}\n${block}`);
      const key = `${fields.name.toLowerCase()}|${fields.address.toLowerCase()}`;
      if (seen.has(key)) return [];
      seen.add(key);
      return [fields];
    })
    .slice(0, 20);
  const firstLine =
    lines.find((line) => !/^#|^https?:/.test(line)) ?? "Instagram 여행 정보";
  return {
    kind: candidates.length ? "place" : "information",
    title:
      candidates.length === 1 ? candidates[0].name : firstLine.slice(0, 90),
    summary: text.slice(0, 320),
    candidates,
  };
}

export function findInstagramMatches(
  places: Place[],
  url: string,
  fields?: InstagramFields,
): Place[] {
  return places.filter(
    (p) =>
      sameInstagramPost(p.sourceUrl, url) ||
      p.instagramSources?.some((source) =>
        sameInstagramPost(source.url, url),
      ) ||
      (fields &&
        p.kind !== "information" &&
        p.name.trim().toLowerCase() === fields.name.trim().toLowerCase() &&
        p.address.trim().toLowerCase() ===
          fields.address.trim().toLowerCase() &&
        p.region.trim().toLowerCase() === fields.region.trim().toLowerCase()),
  );
}

export function createInstagramInformation(
  url: string,
  caption: string,
  analysis: InstagramAnalysis,
  existing?: Place,
): Place {
  const target = existing ?? {
    ...blankPlace(),
    kind: "information" as const,
    name: analysis.title,
    category: "여행 정보",
    status: "추가 확인",
  };
  const result = attachInstagram(
    target,
    url,
    caption,
    extractInstagramFields(""),
  );
  if (result.kind === "information") {
    result.lat = null;
    result.lng = null;
    result.locationInfo = undefined;
  }
  if (analysis.kind === "unknown" && !existing)
    result.evidence = "릴스 링크 저장 · 공개 설명 확인 대기";
  if (
    existing?.evidence === "릴스 링크 저장 · 공개 설명 확인 대기" &&
    caption.trim()
  ) {
    if (existing.name === "확인할 Instagram 릴스") result.name = analysis.title;
    result.evidence = "Instagram 게시물 설명 · 사용자 확인";
  }
  return result;
}

export function createInstagramPlaces(
  places: Place[],
  url: string,
  caption: string,
  candidates: InstagramFields[],
): Place[] {
  if (!candidates.length) throw Error("추가할 장소를 선택해 주세요.");
  const matches = findInstagramMatches(places, url);
  const norm = (value: string) =>
    value.trim().toLowerCase().replace(/\s+/g, " ");
  const result: Place[] = [];
  for (const fields of candidates) {
    if (!fields?.name.trim()) throw Error("장소 이름을 확인해 주세요.");
    const exact = [...result, ...places].find(
      (p) =>
        p.kind !== "information" &&
        norm(p.name) === norm(fields.name) &&
        norm(p.address) === norm(fields.address) &&
        norm(p.region) === norm(fields.region),
    );
    const linked = matches.find(
      (p) =>
        p.kind !== "information" &&
        ((fields.address && norm(p.address) === norm(fields.address)) ||
          (norm(p.name) === norm(fields.name) &&
            (!fields.address || norm(p.address) === norm(fields.address)))),
    );
    const item = attachInstagram(exact ?? linked ?? null, url, caption, fields);
    item.kind = "place";
    const previous = result.findIndex((p) => p.id === item.id);
    if (previous >= 0) result[previous] = item;
    else result.push(item);
  }
  return result;
}
