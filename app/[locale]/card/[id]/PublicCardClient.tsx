"use client"

import { CreatorCardPreview } from "@/app/components/CreatorCardPreview"
import { CardMobilePreviewShell } from "@/app/components/creator-card/CardMobilePreviewShell"

interface PublicCardClientProps {
  locale: string
  creatorCard: {
    profileImageUrl?: string | null
    displayName?: string | null
    username?: string | null
    aboutText?: string | null
    primaryNiche?: string | null
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

export function PublicCardClient({ locale, creatorCard, messages }: PublicCardClientProps) {
  const t = (key: string) => resolveDotPath(messages, key)

  return (
    <CardMobilePreviewShell mode="page">
      <CreatorCardPreview
        t={t}
        locale={locale}
        className="border-0 bg-transparent"
        headerClassName="px-4 py-1 sm:px-6 sm:py-4 border-b border-white/10"
        profileImageUrl={creatorCard.profileImageUrl}
        displayName={creatorCard.displayName}
        username={creatorCard.username}
        aboutText={creatorCard.aboutText}
        primaryNiche={creatorCard.primaryNiche}
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
