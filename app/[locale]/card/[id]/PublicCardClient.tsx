"use client"

import { CreatorCardPreview } from "@/app/components/CreatorCardPreview"

interface PublicCardClientProps {
  locale: "zh-TW" | "en"
  card: {
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
}

// Simple translation function for public card view
function getTranslation(key: string, locale: "zh-TW" | "en"): string {
  const translations: Record<string, Record<string, string>> = {
    "zh-TW": {
      "creatorCard.header.followers": "追蹤者",
      "creatorCard.header.following": "追蹤中",
      "creatorCard.header.posts": "貼文",
      "creatorCard.header.engagement": "互動率",
      "creatorCard.about.title": "關於",
      "creatorCard.contact.title": "聯絡方式",
      "creatorCard.contact.email": "Email",
      "creatorCard.contact.other": "其他",
      "creatorCard.featured.title": "精選作品",
      "creatorCard.details.title": "合作資訊",
      "creatorCard.details.deliverables": "可提供內容格式",
      "creatorCard.details.niches": "合作領域",
      "creatorCard.details.themes": "內容主題",
      "creatorCard.details.audience": "受眾特徵",
      "creatorCard.details.pastCollabs": "過往合作品牌",
    },
    "en": {
      "creatorCard.header.followers": "Followers",
      "creatorCard.header.following": "Following",
      "creatorCard.header.posts": "Posts",
      "creatorCard.header.engagement": "Engagement",
      "creatorCard.about.title": "About",
      "creatorCard.contact.title": "Contact",
      "creatorCard.contact.email": "Email",
      "creatorCard.contact.other": "Other",
      "creatorCard.featured.title": "Featured Work",
      "creatorCard.details.title": "Collaboration Info",
      "creatorCard.details.deliverables": "Content Formats",
      "creatorCard.details.niches": "Collaboration Niches",
      "creatorCard.details.themes": "Content Themes",
      "creatorCard.details.audience": "Audience Profiles",
      "creatorCard.details.pastCollabs": "Past Collaborations",
    },
  }

  return translations[locale]?.[key] || key
}

export function PublicCardClient({ locale, card }: PublicCardClientProps) {
  const t = (key: string) => getTranslation(key, locale)

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-purple-950/20 to-slate-950">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <CreatorCardPreview
          t={t}
          className="border-white/10 bg-slate-900/40 backdrop-blur-sm"
          headerClassName="px-3 py-2 sm:px-4 sm:py-2 lg:px-6 lg:py-3 border-b border-white/10"
          profileImageUrl={card.profileImageUrl}
          displayName={card.displayName}
          username={card.username}
          aboutText={card.aboutText}
          primaryNiche={card.primaryNiche}
          contact={card.contact}
          featuredItems={card.featuredItems || []}
          themeTypes={card.themeTypes}
          audienceProfiles={card.audienceProfiles}
          collaborationNiches={card.collaborationNiches}
          deliverables={card.deliverables}
          pastCollaborations={card.pastCollaborations}
          followers={undefined}
          following={undefined}
          posts={undefined}
          engagementRate={undefined}
        />
      </div>
    </div>
  )
}
