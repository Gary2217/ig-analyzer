"use client"

import { CreatorCardPreview } from "@/app/components/CreatorCardPreview"

interface PublicCreatorCardClientProps {
  locale: string
  creatorCard: any
  messages: any
}

export function PublicCreatorCardClient({ locale, creatorCard, messages }: PublicCreatorCardClientProps) {
  // Dot-path resolver for nested translation keys
  const t = (key: string): string => {
    const keys = key.split(".")
    let current: any = messages
    
    for (const k of keys) {
      if (current && typeof current === "object" && k in current) {
        current = current[k]
      } else {
        return key // Fallback to key if not found
      }
    }
    
    return typeof current === "string" ? current : key
  }
  
  return (
    <div className="max-w-4xl mx-auto mb-6">
      <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
        <CreatorCardPreview
          t={t}
          locale={locale}
          className="border-0 bg-transparent"
          headerClassName="px-4 py-3 sm:px-6 sm:py-4 border-b border-white/10"
          avatarUrl={creatorCard.avatarUrl ?? null}
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
        />
      </div>
    </div>
  )
}
