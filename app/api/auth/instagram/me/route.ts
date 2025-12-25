import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const GRAPH_VERSION = "v21.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

const PREFERRED_USERNAME = (process.env.IG_PREFERRED_USERNAME ?? "").trim();

async function safeJson(res: Response) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    const c = await cookies();

    const token = c.get("ig_access_token")?.value;
    if (!token) {
      return NextResponse.json(
        { stage: "read_cookie", errorMessage: "missing_ig_access_token" },
        { status: 401 },
      );
    }

    // Preserve existing persisted ids if you already store them.
    // Prefer reading from your current storage/wiring instead of hardcoding.
    let page_id = c.get("ig_page_id")?.value || "";
    let ig_id = c.get("ig_ig_id")?.value || "";

    if (!page_id || !ig_id) {
      const accountsUrl = `${GRAPH_BASE}/me/accounts?fields=name,instagram_business_account&access_token=${encodeURIComponent(
        token,
      )}`;
      const accountsRes = await fetch(accountsUrl, { cache: "no-store" });
      const accountsBody = await safeJson(accountsRes);

      if (!accountsRes.ok) {
        return NextResponse.json(
          {
            stage: "load_ids",
            errorMessage: "failed_to_load_accounts",
            upstreamStatus: accountsRes.status,
            upstreamBody: accountsBody,
          },
          { status: 400 },
        );
      }

      const accounts = Array.isArray(accountsBody?.data) ? accountsBody.data : [];
      const candidates = accounts.filter((p: any) => p?.instagram_business_account?.id);

      let picked: any | undefined;
      if (PREFERRED_USERNAME) {
        const preferredLower = PREFERRED_USERNAME.toLowerCase();

        for (const p of candidates) {
          const candidatePageId = String(p?.id ?? "");
          const candidateIgId = String(p?.instagram_business_account?.id ?? "");
          if (!candidatePageId || !candidateIgId) continue;

          // Exchange USER token -> PAGE token
          const candidatePageTokenUrl = `${GRAPH_BASE}/${encodeURIComponent(
            candidatePageId,
          )}?fields=access_token&access_token=${encodeURIComponent(token)}`;
          const candidatePageTokenRes = await fetch(candidatePageTokenUrl, { cache: "no-store" });
          const candidatePageTokenBody = await safeJson(candidatePageTokenRes);

          const candidatePageToken = candidatePageTokenBody?.access_token;
          if (!candidatePageTokenRes.ok || typeof candidatePageToken !== "string" || !candidatePageToken) {
            continue;
          }

          // Fetch IG username using PAGE token
          const candidateUsernameUrl = `${GRAPH_BASE}/${encodeURIComponent(
            candidateIgId,
          )}?fields=username&access_token=${encodeURIComponent(candidatePageToken)}`;
          const candidateUsernameRes = await fetch(candidateUsernameUrl, { cache: "no-store" });
          const candidateUsernameBody = await safeJson(candidateUsernameRes);

          const candidateUsername =
            typeof candidateUsernameBody?.username === "string" ? candidateUsernameBody.username.trim() : "";
          if (candidateUsername && candidateUsername.toLowerCase() === preferredLower) {
            picked = p;
            break;
          }
        }

        if (!picked) {
          return NextResponse.json(
            {
              stage: "load_ids",
              errorMessage: "preferred_username_not_found",
              preferred_username: PREFERRED_USERNAME,
            },
            { status: 400 },
          );
        }
      } else {
        picked = candidates[0];
      }

      if (!picked?.id || !picked?.instagram_business_account?.id) {
        return NextResponse.json(
          { stage: "load_ids", errorMessage: "no_instagram_business_account" },
          { status: 400 },
        );
      }

      page_id = String(picked.id);
      ig_id = String(picked.instagram_business_account.id);

      c.set("ig_page_id", page_id, { httpOnly: true, sameSite: "lax", path: "/" });
      c.set("ig_ig_id", ig_id, { httpOnly: true, sameSite: "lax", path: "/" });
    }

    // 1) Exchange USER token -> PAGE token (required for IG Business Graph reads)
    const pageTokenUrl = `${GRAPH_BASE}/${encodeURIComponent(
      page_id,
    )}?fields=access_token&access_token=${encodeURIComponent(token)}`;
    const pageTokenRes = await fetch(pageTokenUrl, { cache: "no-store" });
    const pageTokenBody = await safeJson(pageTokenRes);

    if (!pageTokenRes.ok || !pageTokenBody?.access_token) {
      return NextResponse.json(
        {
          stage: "exchange_page_token",
          errorMessage: "failed_to_exchange_page_token",
          upstreamStatus: pageTokenRes.status,
          upstreamBody: pageTokenBody,
          page_id,
        },
        { status: 400 },
      );
    }

    const pageToken = pageTokenBody.access_token as string;

    // 2) Fetch IG profile using PAGE token
    const profileFields = [
      "id",
      "username",
      "name",
      "profile_picture_url",
      "followers_count",
      "follows_count",
      "media_count",
    ].join(",");

    const igProfileUrl = `${GRAPH_BASE}/${encodeURIComponent(
      ig_id,
    )}?fields=${encodeURIComponent(profileFields)}&access_token=${encodeURIComponent(
      pageToken,
    )}`;

    const igRes = await fetch(igProfileUrl, { cache: "no-store" });
    const igBody = await safeJson(igRes);

    if (!igRes.ok) {
      return NextResponse.json(
        {
          stage: "fetch_ig_profile",
          errorMessage: "failed_to_fetch_ig_profile",
          upstreamStatus: igRes.status,
          upstreamBody: igBody,
          page_id,
          ig_id,
          fbtrace_id: igBody?.fbtrace_id,
        },
        { status: 400 },
      );
    }

    // Normalize to your UI's expected shape without touching i18n/UI blocks.
    return NextResponse.json(
      {
        connected: true,
        provider: "instagram",
        profile: {
          id: igBody?.id ?? ig_id,
          username: igBody?.username ?? "",
          name: igBody?.name ?? igBody?.username ?? "",
          profile_picture_url: igBody?.profile_picture_url ?? "",
          followers_count: igBody?.followers_count ?? null,
          follows_count: igBody?.follows_count ?? null,
          media_count: igBody?.media_count ?? null,
        },
        page_id,
        ig_id,
      },
      { status: 200 },
    );
  } catch (err: any) {
    return NextResponse.json(
      { stage: "exception", errorMessage: "unexpected_error", detail: String(err) },
      { status: 500 },
    );
  }
}
