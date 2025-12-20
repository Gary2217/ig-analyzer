import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function GET() {
  const c = await cookies();
  const connected = c.get("ig_connected")?.value === "1";

  return NextResponse.json({
    instagramConnected: connected,
  });
}
