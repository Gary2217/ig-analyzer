import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const c = await cookies();
  const h = await headers();

  const cookieToken =
    c.get("ig_access_token")?.value ||
    c.get("instagram_access_token")?.value ||
    c.get("access_token")?.value ||
    "";

  const auth = h.get("authorization") ?? "";
  const bearerRaw = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : "";
  const bearer = bearerRaw.trim();

  const source = cookieToken ? "cookie" : bearer ? "bearer" : "none";
  let token = (cookieToken || bearer || "").trim();

  const mask = (v: string) =>
    v && v.length >= 8 ? `${v.slice(0, 4)}...${v.slice(-4)}` : v ? `${v.slice(0, 2)}...` : "";

  if ((token.startsWith('"') && token.endsWith('"')) || (token.startsWith("'") && token.endsWith("'"))) {
    token = token.slice(1, -1).trim();
  }

  if (!token) {
    return NextResponse.json(
      {
        ok: false,
        error: "missing_token",
        debug: {
          cookieKeysPresent: c.getAll().map((x) => x.name),
          hasAuthorizationHeader: !!auth,
          tokenSource: source,
          tokenLen: token.length,
          tokenMasked: mask(token),
          hasEnv_INSTAGRAM_ACCESS_TOKEN: !!process.env.INSTAGRAM_ACCESS_TOKEN,
          note:
            "已禁止自動使用 env fallback。若 tokenSource=none，代表 callback 沒把 token 存進 cookie（或 cookie key 不一致/被瀏覽器擋）。",
        },
      },
      { status: 400 },
    );
  }

  const looksJsonish =
    token.startsWith("{") ||
    token.startsWith("[") ||
    token.includes('"access_token"') ||
    token.includes("access_token") ||
    token.includes("%7B") ||
    token.includes("%22");

  if (looksJsonish || token.length < 20) {
    return NextResponse.json(
      {
        ok: false,
        error: "token_looks_not_like_access_token",
        debug: {
          tokenSource: source,
          tokenLen: token.length,
          tokenMasked: mask(token),
          hint:
            "看起來像把整包 JSON/物件存進 cookie，或存到 code/state。下一步應檢查 callback 寫 cookie 時是不是把 token JSON.stringify 了，或取錯欄位。",
        },
      },
      { status: 400 },
    );
  }

  const looksBad =
    token === "undefined" ||
    token === "null" ||
    token.toLowerCase().includes("your_") ||
    token.toLowerCase().includes("placeholder");

  if (looksBad) {
    return NextResponse.json(
      {
        ok: false,
        error: "invalid_token_format_before_request",
        debug: {
          tokenSource: source,
          tokenLen: token.length,
          tokenMasked: mask(token),
        },
      },
      { status: 400 },
    );
  }

  try {
    const accountsUrl = new URL("https://graph.facebook.com/v21.0/me/accounts")
    accountsUrl.searchParams.set("fields", "id,name,instagram_business_account")
    accountsUrl.searchParams.set("access_token", token)

    const accountsRes = await fetch(accountsUrl.toString(), { cache: "no-store" })
    const accountsData = (await accountsRes.json()) as any

    if (accountsData?.error) {
      return NextResponse.json(
        {
          ok: false,
          step: "me_accounts",
          graphError: accountsData.error,
          debug: {
            tokenSource: source,
            tokenLen: token.length,
            tokenMasked: mask(token),
            cookieKeysPresent: c.getAll().map((x) => x.name),
            hasAuthorizationHeader: !!auth,
          },
        },
        { status: 400 },
      )
    }

    const pages = Array.isArray(accountsData?.data) ? accountsData.data : []
    const pageWithIg = pages.find((p: any) => p?.instagram_business_account?.id)
    const igId = pageWithIg?.instagram_business_account?.id

    if (!igId) {
      return NextResponse.json(
        {
          ok: false,
          error: "no_instagram_business_account_found",
          debug: {
            pages: pages.map((p: any) => ({
              id: p?.id ?? null,
              name: p?.name ?? null,
              hasInstagramBusinessAccount: Boolean(p?.instagram_business_account?.id),
              instagramBusinessAccountId: p?.instagram_business_account?.id ?? null,
            })),
          },
        },
        { status: 400 },
      )
    }

    const mediaFields = [
      "id",
      "caption",
      "media_type",
      "media_url",
      "permalink",
      "thumbnail_url",
      "timestamp",
      "like_count",
      "comments_count",
    ].join(",")

    const mediaUrl = new URL(`https://graph.facebook.com/v21.0/${encodeURIComponent(String(igId))}/media`)
    mediaUrl.searchParams.set("fields", mediaFields)
    mediaUrl.searchParams.set("limit", "25")
    mediaUrl.searchParams.set("access_token", token)

    const mediaRes = await fetch(mediaUrl.toString(), { cache: "no-store" })
    const mediaData = (await mediaRes.json()) as any

    if (mediaData?.error) {
      return NextResponse.json(
        {
          ok: false,
          step: "ig_media",
          igId,
          graphError: mediaData.error,
          debug: {
            tokenSource: source,
            tokenLen: token.length,
            tokenMasked: mask(token),
            cookieKeysPresent: c.getAll().map((x) => x.name),
            hasAuthorizationHeader: !!auth,
          },
        },
        { status: 400 },
      )
    }

    return NextResponse.json({
      ok: true,
      igId,
      data: Array.isArray(mediaData?.data) ? mediaData.data : [],
      paging: mediaData?.paging ?? null,
    })
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: "unexpected",
      },
      { status: 500 },
    )
  }
}
