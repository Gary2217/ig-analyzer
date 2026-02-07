import { cookies, headers } from "next/headers"
import { PublicCardClient } from "@/app/[locale]/card/[id]/PublicCardClient"
import { PublicCardErrorState } from "@/app/[locale]/card/[id]/PublicCardErrorState"
import messagesZhTW from "@/messages/zh-TW.json"
import messagesEn from "@/messages/en.json"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

interface CreatorCardViewPageProps {
  params: Promise<{
    locale: string
    id: string
  }>
}

function getSiteOrigin() {
  const fromPublic = (process.env.NEXT_PUBLIC_SITE_URL || "").trim()
  if (fromPublic && fromPublic.startsWith("http")) return fromPublic.replace(/\/$/, "")

  const vercelUrl = (process.env.VERCEL_URL || "").trim()
  if (vercelUrl) return `https://${vercelUrl}`

  return "http://localhost:3000"
}

async function fetchCreatorCardView(id: string) {
  const cookieStore = await cookies()
  const headerStore = await headers()

  const cookieHeader = cookieStore
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ")

  const reqId = headerStore.get("x-request-id")

  const origin = getSiteOrigin()
  const url = new URL("/api/creator-card/view", origin)
  url.searchParams.set("id", id)

  const res = await fetch(url.toString(), {
    method: "GET",
    cache: "no-store",
    headers: {
      ...(cookieHeader ? { cookie: cookieHeader } : null),
      ...(reqId ? { "x-request-id": reqId } : null),
    },
  })

  const json = (await res.json().catch(() => null)) as any
  return { res, json }
}

export default async function CreatorCardViewPage({ params }: CreatorCardViewPageProps) {
  const resolvedParams = await params
  const locale = resolvedParams.locale === "zh-TW" ? "zh-TW" : "en"
  const id = resolvedParams.id

  try {
    const { res, json } = await fetchCreatorCardView(id)

    if (!res.ok || !json?.ok || !json?.card) {
      const errorType: "not_found" | "service_error" | "env_missing" =
        res.status === 404 ? "not_found" : "service_error"
      return <PublicCardErrorState locale={locale} errorType={errorType} />
    }

    const messages = locale === "zh-TW" ? messagesZhTW : messagesEn
    return <PublicCardClient locale={locale} creatorCard={json.card} messages={messages} />
  } catch {
    return <PublicCardErrorState locale={locale} errorType="service_error" />
  }
}
