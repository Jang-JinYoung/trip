import { extractPublicCaption, normalizeInstagramUrl } from "./instagram";
import {
  analyzeInstagramCaption,
  cleanCaption,
  type InstagramAnalysis,
} from "./instagram-analysis";

export type InstagramPreview = {
  url: string;
  caption: string;
  status: "available" | "manual";
  message: string;
  analysis: InstagramAnalysis;
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
      "이 릴스의 공개 설명을 읽을 수 없습니다. 링크를 확인 대기로 보관하거나 설명을 붙여 넣어 다시 분류할 수 있어요.",
    analysis: analyzeInstagramCaption(""),
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
    const caption = cleanCaption(extractPublicCaption(html));
    return caption
      ? {
          url,
          caption,
          status: "available",
          message:
            "공개 설명을 읽어 분류했습니다. 영상 속 자막·음성은 분석하지 않으며, 설명이 일부만 제공될 수 있어요.",
          analysis: analyzeInstagramCaption(caption),
        }
      : manual;
  } catch {
    return manual;
  }
}
