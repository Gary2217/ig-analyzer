"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { CreatorCardPreview } from "@/app/components/CreatorCardPreview"
import { CardMobilePreviewShell } from "@/app/components/creator-card/CardMobilePreviewShell"
import { CreatorAvatarEditor } from "@/app/components/creator-card/CreatorAvatarEditor"
import { bumpAvatarBuster } from "@/app/lib/client/avatarBuster"

interface PublicCardClientProps {
  locale: string
  creatorCard: {
    ownerUserId?: string | null
    avatarUrl?: string | null
    fallbackUrl?: string | null
    profileImageUrl?: string | null
    displayName?: string | null
    username?: string | null
    aboutText?: string | null
    primaryNiche?: string | null
    minPrice?: number | null
    contact?: any
    featuredItems?: any[]
    deliverables?: any[]
    collaborationNiches?: any[]
    themeTypes?: any[]
    audienceProfiles?: any[]
    pastCollaborations?: any[]
    cardId?: string | null
  }
  messages: any
  isOwner?: boolean
}

// Dot-path resolver for nested i18n keys
function resolveDotPath(obj: any, path: string): string {
  if (!obj || typeof obj !== "object") return path
  
  const keys = path.split(".")
  let current = obj
  
  for (const key of keys) {
    if (current && typeof current === "object" && key in current) {
      current = current[key]
    } else {
      return path // Key not found, return original path as fallback
    }
  }
  
  return typeof current === "string" ? current : path
}

export function PublicCardClient({ locale, creatorCard, messages, isOwner }: PublicCardClientProps) {
  const t = (key: string) => resolveDotPath(messages, key)

  const router = useRouter()
  const normalizedLocale = useMemo(() => (/^zh(-|$)/i.test(String(locale || "")) ? "zh-TW" : "en") as "zh-TW" | "en", [locale])

  const [localAvatarUrl, setLocalAvatarUrl] = useState<string | null>(
    typeof creatorCard.avatarUrl === "string" && creatorCard.avatarUrl.trim() ? creatorCard.avatarUrl.trim() : null,
  )

  const effectiveProfileImageUrl =
    localAvatarUrl ??
    (typeof creatorCard.fallbackUrl === "string" && creatorCard.fallbackUrl.trim() ? creatorCard.fallbackUrl.trim() : null) ??
    (typeof creatorCard.profileImageUrl === "string" && creatorCard.profileImageUrl.trim() ? creatorCard.profileImageUrl.trim() : null)

  return (
    <CardMobilePreviewShell mode="page">
      {isOwner ? (
        <div className="px-4 pt-4 sm:px-6">
          <CreatorAvatarEditor
            locale={normalizedLocale}
            avatarUrl={localAvatarUrl}
            fallbackUrl={creatorCard.fallbackUrl ?? null}
            canEdit={true}
            onChanged={(nextUrl) => {
              setLocalAvatarUrl(nextUrl)
              bumpAvatarBuster()
              try {
                router.refresh()
              } catch {
              }
            }}
          />
        </div>
      ) : null}
      <CreatorCardPreview
        t={t}
        locale={locale}
        className="border-0 bg-transparent"
        headerClassName="px-4 py-1 sm:px-6 sm:py-4 border-b border-white/10"
        avatarUrl={localAvatarUrl ?? creatorCard.avatarUrl ?? null}
        profileImageUrl={effectiveProfileImageUrl}
        displayName={creatorCard.displayName}
        username={creatorCard.username}
        aboutText={creatorCard.aboutText}
        primaryNiche={creatorCard.primaryNiche}
        minPrice={typeof creatorCard.minPrice === "number" ? creatorCard.minPrice : null}
        contact={creatorCard.contact}
        featuredItems={creatorCard.featuredItems || []}
        themeTypes={creatorCard.themeTypes}
        audienceProfiles={creatorCard.audienceProfiles}
        collaborationNiches={creatorCard.collaborationNiches}
        deliverables={creatorCard.deliverables}
        pastCollaborations={creatorCard.pastCollaborations}
        followers={undefined}
        following={undefined}
        posts={undefined}
        engagementRate={undefined}
      />
    </CardMobilePreviewShell>
  )
}
