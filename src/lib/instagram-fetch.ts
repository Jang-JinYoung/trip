import { extractPublicCaption, normalizeInstagramUrl } from "./instagram";

export type InstagramPreview = {
  url: string;
  caption: string;
  status: "available" | "manual";
  message: string;
};
export async function fetchInstagramPreview(
  input: string,
  fetcher: typeof fetch = fetch,
): Promise<InstagramPreview> {
  const url = normalizeInstagramUrl(input);
  const manual: InstagramPreview = {
    url,
    caption: "",
    status: "manual",
    message:
      "Instagram에서 게시물 설명을 제공하지 않았습니다. 원본 게시물을 열어 설명을 붙여 넣거나 장소 정보를 직접 입력해 주세요.",
  };
  try {
    // Redirects to login pages or external destinations are deliberately not followed.
    const response = await fetcher(url, {
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
      headers: {
        Accept: "text/html",
        "User-Agent": "TripAtlas/0.1 (public post preview)",
      },
    });
    if (
      !response.ok ||
      !response.headers.get("content-type")?.includes("text/html")
    ) {
      await response.body?.cancel();
      return manual;
    }
    const reader = response.body?.getReader();
    if (!reader) return manual;
    const decoder = new TextDecoder();
    let html = "",
      size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 1024 * 1024) {
          await reader.cancel();
          return manual;
        }
        html += decoder.decode(value, { stream: true });
      }
      html += decoder.decode();
    } finally {
      reader.releaseLock();
    }
    const caption = extractPublicCaption(html);
    return caption
      ? {
          url,
          caption,
          status: "available",
          message:
            "공개 게시물의 미리보기 설명을 가져왔습니다. 일부만 제공될 수 있으므로 원문과 장소 정보를 확인해 주세요.",
        }
      : manual;
  } catch {
    return manual;
  }
}
