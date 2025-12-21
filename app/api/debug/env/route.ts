import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const appBaseUrl = process.env.APP_BASE_URL ?? null;
  const appId = process.env.META_APP_ID ?? null;
  const hasSecret = !!process.env.META_APP_SECRET;

  return NextResponse.json({
    APP_BASE_URL: appBaseUrl,
    META_APP_ID: appId,
    HAS_SECRET: hasSecret,
    NODE_ENV: process.env.NODE_ENV ?? null,
  });
}
