"use client"

import { CreatorCardPreviewSection } from "../components/creator-card/CreatorCardPreviewSection"

interface CreatorCardShowcaseProps {
  locale: string
  username: string
  displayName: string
  isConnected: boolean
  isLoading: boolean
  hasCard: boolean
  isCardPublic: boolean
  cardId?: string
  topPosts?: any[]
  latestPosts?: any[]
  t: (key: string) => string
}

export function CreatorCardShowcase({
  locale,
  username,
  displayName,
  isConnected,
  isLoading,
  hasCard,
  isCardPublic,
  cardId,
  topPosts = [],
  latestPosts = [],
  t,
}: CreatorCardShowcaseProps) {
  return (
    <CreatorCardPreviewSection
      locale={locale}
      username={username}
      displayName={displayName}
      isConnected={isConnected}
      isLoading={isLoading}
      hasCard={hasCard}
      isCardPublic={isCardPublic}
      cardId={cardId}
      topPosts={topPosts}
      latestPosts={latestPosts}
      t={t}
      showHeaderButtons={true}
    />
  )
}
