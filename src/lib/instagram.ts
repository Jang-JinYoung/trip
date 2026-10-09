import { blankPlace, type Place } from "./places";

export function normalizeInstagramUrl(input: string): string {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new Error("Instagram 게시물 URL을 입력해 주세요.");
  }
  if (
    url.protocol !== "https:" ||
    !["instagram.com", "www.instagram.com", "m.instagram.com"].includes(
      url.hostname,
    ) ||
    url.username ||
    url.password ||
    url.port
  ) {
    throw new Error(
      "https://www.instagram.com/으로 시작하는 게시물 URL만 사용할 수 있습니다.",
    );
  }
  const match = url.pathname.match(
    /^\/(p|reel|reels|tv)\/([a-zA-Z0-9_-]{5,64})\/?$/,
  );
  if (!match)
    throw new Error(
      "프로필·스토리·공유 단축 링크 대신 게시물이나 릴스의 원본 URL을 입력해 주세요.",
    );
  return `https://www.instagram.com/${match[1] === "reels" ? "reel" : match[1]}/${match[2]}/`;
}
export function sameInstagramPost(a: string, b: string): boolean {
  try {
    return (
      new URL(normalizeInstagramUrl(a)).pathname.split("/")[2] ===
      new URL(normalizeInstagramUrl(b)).pathname.split("/")[2]
    );
  } catch {
    return false;
  }
}
export type InstagramFields = {
  name: string;
  address: string;
  region: string;
  category: string;
  hours: string;
  price: string;
};
export function extractInstagramFields(caption: string): InstagramFields {
  const field = (labels: string) =>
    caption
      .match(
        new RegExp(
          `(?:^|\\n)\\s*(?:📍|🏠|📌|⏰|💰)?\\s*(?:${labels})\\s*[:：]\\s*([^\\n]+)`,
          "i",
        ),
      )?.[1]
      .trim()
      .slice(0, 500) ?? "";
  return {
    name: field("장소명|상호명|상호|장소|가게|name"),
    address: field("주소|위치|address"),
    region: field("지역|권역|region"),
    category: field("분류|카테고리|category"),
    hours: field("영업시간|운영시간|hours"),
    price: field("가격|price"),
  };
}
export function attachInstagram(
  place: Place | null,
  url: string,
  caption: string,
  fields: InstagramFields,
): Place {
  const canonical = normalizeInstagramUrl(url);
  const next = { ...(place ?? blankPlace()) };
  for (const key of Object.keys(fields) as (keyof InstagramFields)[]) {
    if (
      (!next[key] || (key === "category" && next.category === "기타")) &&
      fields[key].trim()
    )
      next[key] = fields[key].trim();
  }
  if (!next.name.trim()) throw new Error("새 장소의 이름을 입력해 주세요.");
  const sources = [...(next.instagramSources ?? [])];
  const index = sources.findIndex((s) => sameInstagramPost(s.url, canonical));
  if (index >= 0) {
    const previous = sources[index];
    const combined =
      !caption.trim() || previous.caption === caption.trim()
        ? previous.caption
        : [previous.caption, caption.trim()].filter(Boolean).join("\n\n");
    sources[index] = { ...previous, caption: combined };
  } else
    sources.push({
      url: canonical,
      caption: caption.trim(),
      addedAt: new Date().toISOString(),
    });
  next.instagramSources = sources;
  if (!next.sourceUrl) next.sourceUrl = canonical;
  if (!next.description) next.description = caption.trim();
  if (!next.evidence) next.evidence = "Instagram 게시물 설명 · 사용자 확인";
  return next;
}

function decodeEntities(text: string): string {
  const named: Record<string, string> = {
    amp: "&",
    quot: '"',
    apos: "'",
    lt: "<",
    gt: ">",
    nbsp: " ",
  };
  return text.replace(
    /&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt|nbsp);/gi,
    (whole, entity: string) => {
      if (!entity.startsWith("#")) return named[entity.toLowerCase()] ?? whole;
      const n =
        entity[1].toLowerCase() === "x"
          ? parseInt(entity.slice(2), 16)
          : Number(entity.slice(1));
      return Number.isInteger(n) && n > 0 && n <= 0x10ffff
        ? String.fromCodePoint(n)
        : whole;
    },
  );
}
/** Only reads plain public metadata; never executes or renders external HTML. */
export function extractPublicCaption(html: string): string {
  for (const script of html.matchAll(
    /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    try {
      const parsed = JSON.parse(script[1]);
      const nodes = Array.isArray(parsed)
        ? parsed
        : [
            parsed,
            ...(Array.isArray(parsed?.["@graph"]) ? parsed["@graph"] : []),
          ];
      for (const node of nodes) {
        if (
          !node ||
          !["VideoObject", "SocialMediaPosting", "Article"].includes(
            node["@type"],
          )
        )
          continue;
        const caption = node.articleBody || node.caption || node.description;
        if (
          typeof caption === "string" &&
          caption.trim() &&
          !/log in to see|sign up to see|로그인하여/i.test(caption)
        )
          return decodeEntities(caption.trim()).slice(0, 12000);
      }
    } catch {
      /* Invalid external metadata must not prevent the OG fallback. */
    }
  }
  const meta = new Map<string, string>();
  for (const tag of html.match(/<meta\s[^>]*>/gi) ?? []) {
    const attributes = new Map<string, string>();
    for (const match of tag.matchAll(
      /([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g,
    ))
      attributes.set(
        match[1].toLowerCase(),
        decodeEntities(match[2] ?? match[3]),
      );
    const name = attributes.get("property") ?? attributes.get("name");
    if (name && attributes.has("content"))
      meta.set(name.toLowerCase(), attributes.get("content")!);
  }
  const description = (
    meta.get("og:description") ||
    meta.get("description") ||
    ""
  ).trim();
  if (
    !description ||
    /^(?:Instagram|Login\s*[•|\-]\s*Instagram)$/i.test(description) ||
    /create an account|sign up to see|log in to see|로그인하여|가입하여/i.test(
      description,
    )
  )
    return "";
  return description.slice(0, 12000);
}
