import { NextResponse } from "next/server";

const GRAPH_VERSION = "v24.0";
const PAGE_ID = "851912424681350";
const IG_BUSINESS_ID = "17841404364250644";

function jsonError(message: string, extra?: any, status = 400) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const after = url.searchParams.get("after") || "";
    const limit = url.searchParams.get("limit") || "25";

    // 1) 從 cookie 取得 User Access Token（注意名稱）
    const cookie = req.headers.get("cookie") || "";
    const match = cookie.match(/ig_access_token=([^;]+)/);
    const userAccessToken = match?.[1];

    if (!userAccessToken) {
      return jsonError(
        "missing_user_access_token",
        { hint: "login via /api/auth/instagram first" },
        401
      );
    }

    // 2) 使用 User token 換 Page Access Token
    const pageTokenRes = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${PAGE_ID}?fields=access_token&access_token=${encodeURIComponent(
        userAccessToken
      )}`,
      { cache: "no-store" }
    );

    const pageTokenJson = await pageTokenRes.json();

    if (!pageTokenRes.ok || !pageTokenJson?.access_token) {
      return jsonError(
        "failed_to_get_page_access_token",
        { meta: pageTokenJson },
        pageTokenRes.status || 400
      );
    }

    const pageAccessToken = pageTokenJson.access_token as string;

    // 3) 使用 Page token 取得 IG media（支援 paging）
    const fields = [
      "id",
      "caption",
      "media_type",
      "media_url",
      "permalink",
      "timestamp",
      "like_count",
      "comments_count",
    ].join(",");

    const mediaUrl =
      `https://graph.facebook.com/${GRAPH_VERSION}/${IG_BUSINESS_ID}/media` +
      `?fields=${encodeURIComponent(fields)}` +
      `&limit=${encodeURIComponent(limit)}` +
      (after ? `&after=${encodeURIComponent(after)}` : "") +
      `&access_token=${encodeURIComponent(pageAccessToken)}`;

    const mediaRes = await fetch(mediaUrl, { cache: "no-store" });
    const mediaJson = await mediaRes.json();

    if (!mediaRes.ok) {
      return jsonError(
        "failed_to_fetch_media",
        { meta: mediaJson },
        mediaRes.status || 400
      );
    }

    return NextResponse.json(mediaJson);
  } catch (err: any) {
    return jsonError(
      "server_error",
      { message: err?.message ?? String(err) },
      500
    );
  }
}
