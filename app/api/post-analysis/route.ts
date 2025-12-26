import { NextResponse } from "next/server";

const GRAPH_VERSION = "v24.0";
const PAGE_ID = "851912424681350";
const IG_BUSINESS_ID = "17841404364250644";

function jsonError(message: string, extra?: any, status = 400) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

async function fetchJson(url: string) {
  const res = await fetch(url, { cache: "no-store" });
  const json = await res.json();
  return { res, json };
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as { url?: unknown } | null;
    const permalink = typeof body?.url === "string" ? body.url.trim() : "";

    if (!permalink) {
      return jsonError("missing_url", { hint: "POST body: { url }" }, 400);
    }

    // 1) From cookie get User Access Token
    const cookie = req.headers.get("cookie") || "";
    const match = cookie.match(/ig_access_token=([^;]+)/);
    const userAccessToken = match?.[1];
    if (!userAccessToken) {
      return jsonError("missing_user_access_token", { hint: "login via /api/auth/instagram first" }, 401);
    }

    // 2) Exchange for Page Access Token
    const { res: pageTokenRes, json: pageTokenJson } = await fetchJson(
      `https://graph.facebook.com/${GRAPH_VERSION}/${PAGE_ID}?fields=access_token&access_token=${encodeURIComponent(userAccessToken)}`,
    );

    if (!pageTokenRes.ok || !pageTokenJson?.access_token) {
      return jsonError(
        "failed_to_get_page_access_token",
        { meta: pageTokenJson },
        pageTokenRes.status || 400,
      );
    }

    const pageAccessToken = pageTokenJson.access_token as string;

    // 3) Fetch media pages and find matching permalink
    const fields = [
      "id",
      "media_type",
      "media_url",
      "thumbnail_url",
      "permalink",
      "timestamp",
      "caption",
      "like_count",
      "comments_count",
    ].join(",");

    let after = "";
    const limit = "50";
    const maxPages = 6;

    for (let page = 0; page < maxPages; page++) {
      const mediaUrl =
        `https://graph.facebook.com/${GRAPH_VERSION}/${IG_BUSINESS_ID}/media` +
        `?fields=${encodeURIComponent(fields)}` +
        `&limit=${encodeURIComponent(limit)}` +
        (after ? `&after=${encodeURIComponent(after)}` : "") +
        `&access_token=${encodeURIComponent(pageAccessToken)}`;

      const { res: mediaRes, json: mediaJson } = await fetchJson(mediaUrl);

      if (!mediaRes.ok) {
        return jsonError(
          "failed_to_fetch_media",
          { meta: mediaJson },
          mediaRes.status || 400,
        );
      }

      const items: any[] = Array.isArray(mediaJson?.data) ? mediaJson.data : [];
      const found = items.find((m) => typeof m?.permalink === "string" && m.permalink.trim() === permalink);

      if (found) {
        const like_count = Number(found?.like_count ?? 0) || 0;
        const comments_count = Number(found?.comments_count ?? 0) || 0;
        const engagement = like_count + comments_count;

        return NextResponse.json(
          {
            permalink: found.permalink,
            media_type: typeof found?.media_type === "string" ? found.media_type : undefined,
            timestamp: typeof found?.timestamp === "string" ? found.timestamp : undefined,
            caption: typeof found?.caption === "string" ? found.caption : undefined,
            thumbnail_url: typeof found?.thumbnail_url === "string" ? found.thumbnail_url : undefined,
            media_url: typeof found?.media_url === "string" ? found.media_url : undefined,
            like_count,
            comments_count,
            engagement,
          },
          { status: 200 },
        );
      }

      after = typeof mediaJson?.paging?.cursors?.after === "string" ? mediaJson.paging.cursors.after : "";
      if (!after) break;
    }

    return jsonError("post_not_found", { permalink }, 404);
  } catch (err: any) {
    return jsonError("server_error", { message: err?.message ?? String(err) }, 500);
  }
}
