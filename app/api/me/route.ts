import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createAuthedClient } from "@/lib/supabase/server";

export async function GET() {
  const c = await cookies();
  const connected = c.get("ig_connected")?.value === "1";

  try {
    const authed = await createAuthedClient()
    const userRes = await authed.auth.getUser()
    const user = userRes?.data?.user ?? null

    if (!user) {
      return NextResponse.json({
        ok: false,
        error: "not_logged_in",
        user: null,
        instagramConnected: connected,
      })
    }

    return NextResponse.json({
      ok: true,
      user: { id: user.id, email: user.email ?? null },
      instagramConnected: connected,
    })
  } catch {
    return NextResponse.json({
      ok: false,
      error: "unknown",
      user: null,
      instagramConnected: connected,
    })
  }
}
