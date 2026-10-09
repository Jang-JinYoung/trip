type Tokens = { access_token: string; refresh_token: string };

export async function handleLocalAdminLogin(
  request: Request,
  development: boolean,
  login: () => Promise<Tokens>,
) {
  const headers = { "Cache-Control": "no-store, private" };
  const url = new URL(request.url);
  if (
    !development ||
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
  )
    return Response.json(
      { error: "로컬 임시 로그인은 이 환경에서 사용할 수 없습니다." },
      { status: 404, headers },
    );
  if (
    request.headers.get("origin") !== url.origin ||
    request.headers.get("sec-fetch-site") === "cross-site"
  )
    return Response.json(
      { error: "허용되지 않은 요청입니다." },
      { status: 403, headers },
    );
  try {
    const raw = await request.text();
    if (raw.length > 1024)
      return Response.json(
        { error: "요청이 너무 큽니다." },
        { status: 413, headers },
      );
    const input = JSON.parse(raw);
    if (input?.username !== "admin" || input?.password !== "admin")
      return Response.json(
        { error: "아이디 또는 비밀번호를 확인해 주세요." },
        { status: 401, headers },
      );
    return Response.json(await login(), { headers });
  } catch {
    return Response.json(
      { error: "임시 계정에 연결하지 못했습니다." },
      { status: 503, headers },
    );
  }
}
