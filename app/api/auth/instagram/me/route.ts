import { NextResponse, type NextRequest } from "next/server";
import { getMeState } from "@/app/lib/server/instagramMeResolver"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const state = await getMeState(req)

  // This route should not surface normal states as HTTP 401.
  // - not connected: valid state (HTTP 200)
  // - IG/profile fetch failure: valid transient state (HTTP 200)
  // Only use HTTP 401 if this project adds a separate "platform session" concept for this endpoint.

  const connected = Boolean(state.connected)
  const igUserId = typeof state.igUserId === "string" ? state.igUserId : null

  if (!connected) {
    return NextResponse.json(
      {
        ...state,
        ok: false,
        connected: false,
        igUserId: null,
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    )
  }

  if (state.profileError === "failed_to_fetch_profile") {
    return NextResponse.json(
      {
        ...state,
        ok: false,
        connected: true,
        igUserId,
        error: "profile_fetch_failed",
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    )
  }

  return NextResponse.json(
    {
      ...state,
      ok: true,
      connected: true,
      igUserId: igUserId as string,
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  )
}
