import { fetchInstagramPreview } from "@/lib/instagram-fetch";
import { normalizeReelUrl } from "@/lib/instagram-analysis";

export const runtime = "nodejs";
const cache = new Map<
  string,
  { expires: number; data: Awaited<ReturnType<typeof fetchInstagramPreview>> }
>();
let budget = { started: 0, count: 0 };
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    return Response.json(
      { error: "허용되지 않은 요청입니다." },
      { status: 403 },
    );
  const body = await request.text();
  if (body.length > 2048)
    return Response.json({ error: "URL이 너무 깁니다." }, { status: 413 });
  let url: string;
  try {
    const input = JSON.parse(body);
    if (!input || typeof input.url !== "string")
      throw Error("Instagram URL을 입력해 주세요.");
    url = normalizeReelUrl(input.url);
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "올바른 URL을 입력해 주세요." },
      { status: 400 },
    );
  }
  const cached = cache.get(url);
  if (cached && cached.expires > Date.now()) return Response.json(cached.data);
  if (Date.now() - budget.started > 60000)
    budget = { started: Date.now(), count: 0 };
  if (budget.count >= 15)
    return Response.json(
      {
        error:
          "요청이 많습니다. 잠시 후 다시 시도하거나 설명을 직접 붙여 넣어 주세요.",
      },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  budget.count++;
  const data = await fetchInstagramPreview(url);
  if (cache.size >= 100) cache.delete(cache.keys().next().value!);
  cache.set(url, {
    expires: Date.now() + (data.status === "available" ? 300000 : 30000),
    data,
  });
  return Response.json(data);
}
