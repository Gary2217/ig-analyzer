"use client"

import { useMemo } from "react"
import { useI18n } from "@/components/locale-provider"
import { useInstagramConnection } from "@/app/components/InstagramConnectionProvider"
import { CreatorCardPreviewSection } from "@/app/components/creator-card/CreatorCardPreviewSection"

type CreatorCardPreviewViewPageProps = {
  params: {
    locale: string
  }
}

function pickString(v: unknown): string {
  return typeof v === "string" ? v : ""
}

export default function CreatorCardPreviewViewPage({ params }: CreatorCardPreviewViewPageProps) {
  const locale = /^zh(-|$)/i.test(String(params.locale || "")) ? "zh-TW" : "en"
  const { t } = useI18n()
  const igConn = useInstagramConnection()

  const { username, displayName } = useMemo(() => {
    const me = igConn.igMe as any
    const profile = me?.profile ?? me

    const u = pickString(profile?.username)
    const n = pickString(profile?.name)

    return {
      username: u,
      displayName: n,
    }
  }, [igConn.igMe])

  return (
    <CreatorCardPreviewSection
      locale={locale}
      username={username}
      displayName={displayName}
      isConnected={igConn.isConnected}
      isLoading={false}
      hasCard={false}
      isCardPublic={false}
      t={t}
      showHeaderButtons={false}
    />
  )
}
