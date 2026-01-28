"use client"

import { CreatorCardPreview } from "@/app/components/CreatorCardPreview"

interface PublicCreatorCardClientProps {
  locale: string
  creatorCard: any
  translations: Record<string, string>
}

export function PublicCreatorCardClient({ locale, creatorCard, translations }: PublicCreatorCardClientProps) {
  const t = (key: string) => translations[key] || key
  
  return (
    <div className="max-w-4xl mx-auto mb-6">
      <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
        <CreatorCardPreview
          t={t}
          className="border-0 bg-transparent"
          headerClassName="px-4 py-3 sm:px-6 sm:py-4 border-b border-white/10"
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
