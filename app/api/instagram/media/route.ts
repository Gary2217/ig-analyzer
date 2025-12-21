import { NextResponse } from "next/server";

export async function GET() {
  const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN;

  if (!accessToken) {
    return NextResponse.json(
      { error: "Missing INSTAGRAM_ACCESS_TOKEN" },
      { status: 400 }
    );
  }

  const fields = [
    "id",
    "caption",
    "timestamp",
    "like_count",
    "comments_count"
  ].join(",");

  const url = `https://graph.instagram.com/me/media?fields=${fields}&access_token=${accessToken}`;

  const res = await fetch(url, { cache: "no-store" });
  const data = await res.json();

  return NextResponse.json(data);
}
