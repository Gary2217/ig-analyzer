import { NextResponse } from "next/server"

export async function POST() {
  return NextResponse.json({ ok: false, message: "Billing not configured" }, { status: 501 })
}

export async function GET() {
  return NextResponse.json({ ok: false, message: "Billing not configured" }, { status: 501 })
}
