import { NextResponse } from "next/server";

export const runtime = "nodejs";

 function mask(v?: string) {
   if (!v) return null;
   if (v.length <= 6) return "***";
   return `${v.slice(0, 3)}***${v.slice(-2)}`;
 }

export async function GET() {
  const appBaseUrl = process.env.APP_BASE_URL;
  const metaAppId = process.env.META_APP_ID;
  const metaAppSecret = process.env.META_APP_SECRET;

  const alt = {
    NEXT_PUBLIC_APP_BASE_URL: process.env.NEXT_PUBLIC_APP_BASE_URL,
    INSTAGRAM_APP_ID: process.env.INSTAGRAM_APP_ID,
    INSTAGRAM_APP_SECRET: process.env.INSTAGRAM_APP_SECRET,
    META_CLIENT_ID: process.env.META_CLIENT_ID,
    META_CLIENT_SECRET: process.env.META_CLIENT_SECRET,
  };

  return NextResponse.json({
    ok: true,
    nodeEnv: process.env.NODE_ENV,
    cwd: process.cwd(),
    expected: {
      APP_BASE_URL: appBaseUrl ?? null,
      META_APP_ID: metaAppId ? mask(metaAppId) : null,
      META_APP_SECRET: metaAppSecret ? mask(metaAppSecret) : null,
      has_APP_BASE_URL: Boolean(appBaseUrl),
      has_META_APP_ID: Boolean(metaAppId),
      has_META_APP_SECRET: Boolean(metaAppSecret),
    },
    alternatives: Object.fromEntries(
      Object.entries(alt).map(([k, v]) => [k, v ? mask(v) : null]),
    ),
  });
}
