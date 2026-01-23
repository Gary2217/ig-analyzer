import Link from "next/link"
import { ArrowLeft, Mail, Globe, Instagram } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ProfilePreviewClient } from "./ProfilePreviewClient"
import { CreatorProfileData } from "./types"

interface CreatorProfilePageProps {
  params: Promise<{
    locale: string
    id: string
  }>
}

export default async function CreatorProfilePage({ params }: CreatorProfilePageProps) {
  const resolvedParams = await params
  const locale = resolvedParams.locale === "zh-TW" ? "zh-TW" : "en"
  const creatorId = resolvedParams.id

  // TODO: Fetch real profile data from API
  // const profileData = await fetchCreatorProfile(creatorId)
  const profileData: CreatorProfileData | null = null

  const copy = locale === "zh-TW"
    ? {
        title: "創作者名片",
        comingSoon: "完整個人檔案即將推出",
        description: "我們正在建立完整的創作者個人檔案功能。敬請期待！",
        back: "返回",
        idLabel: "代號",
        collaborationMethods: "合作方式",
        contact: "聯絡管道",
        pastCollaborations: "合作品牌",
        instagram: "Instagram",
        email: "電子郵件",
        website: "網站",
      }
    : {
        title: "Creator Profile",
        comingSoon: "Full profile coming soon",
        description: "We're building a complete creator profile experience. Stay tuned!",
        back: "Back",
        idLabel: "ID",
        collaborationMethods: "Collaboration Methods",
        contact: "Contact",
        pastCollaborations: "Past Collaborations",
        instagram: "Instagram",
        email: "Email",
        website: "Website",
      }

  // Check if we have any real data to show
  const data = profileData as CreatorProfileData | null
  const hasCollaborationMethods = !!(data?.collaborationMethods && data.collaborationMethods.length > 0)
  const hasContact = !!(data?.contact && (data.contact.instagram || data.contact.email || data.contact.website))
  const hasPastBrands = !!(data?.pastBrands && data.pastBrands.length > 0)
  const hasAnyRealData = hasCollaborationMethods || hasContact || hasPastBrands

  return (
    <div className="min-h-[calc(100dvh-80px)] w-full">
      <div className="w-full max-w-4xl mx-auto px-4 py-8 sm:py-12">
        {/* Back Button */}
        <div className="mb-6">
          <Link href={`/${resolvedParams.locale}/matchmaking`}>
            <Button
              variant="ghost"
              size="sm"
              className="h-10 px-3 text-white/80 hover:text-white hover:bg-white/10"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              {copy.back}
            </Button>
          </Link>
        </div>

        {/* Header */}
        <div className="text-center mb-8 sm:mb-12">
          <h1 className="text-3xl sm:text-4xl font-bold text-white tracking-tight mb-4">
            {copy.title}
          </h1>
        </div>

        {/* Preview from sessionStorage (if available) */}
        {creatorId && (
          <div className="max-w-2xl mx-auto mb-6">
            <ProfilePreviewClient creatorId={creatorId} locale={locale} />
          </div>
        )}

        {/* Collaboration Methods Section - ONLY if data exists */}
        {hasCollaborationMethods && profileData && (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 max-w-2xl mx-auto mb-6">
            <h3 className="text-lg font-semibold text-white mb-4">{copy.collaborationMethods}</h3>
            <div className="flex flex-wrap gap-2">
              {(profileData as CreatorProfileData).collaborationMethods!.map((method: string, index: number) => (
                <div
                  key={index}
                  className="px-3 py-1.5 rounded-lg bg-white/10 border border-white/10 text-sm text-white/90"
                >
                  {method}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Contact Section - ONLY if data exists */}
        {hasContact && profileData && (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 max-w-2xl mx-auto mb-6">
            <h3 className="text-lg font-semibold text-white mb-4">{copy.contact}</h3>
            <div className="space-y-3">
              {(profileData as CreatorProfileData).contact!.instagram && (
                <a
                  href={`https://instagram.com/${(profileData as CreatorProfileData).contact!.instagram}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 p-3 rounded-lg bg-white/5 hover:bg-white/10 transition-colors border border-white/10 hover:border-white/20"
                >
                  <Instagram className="w-5 h-5 text-white/60" />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs text-white/50 mb-0.5">{copy.instagram}</div>
                    <div className="text-sm text-white/90 break-words">@{(profileData as CreatorProfileData).contact!.instagram}</div>
                  </div>
                </a>
              )}
              {(profileData as CreatorProfileData).contact!.email && (
                <a
                  href={`mailto:${(profileData as CreatorProfileData).contact!.email}`}
                  className="flex items-center gap-3 p-3 rounded-lg bg-white/5 hover:bg-white/10 transition-colors border border-white/10 hover:border-white/20"
                >
                  <Mail className="w-5 h-5 text-white/60" />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs text-white/50 mb-0.5">{copy.email}</div>
                    <div className="text-sm text-white/90 break-words">{(profileData as CreatorProfileData).contact!.email}</div>
                  </div>
                </a>
              )}
              {(profileData as CreatorProfileData).contact!.website && (
                <a
                  href={(profileData as CreatorProfileData).contact!.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 p-3 rounded-lg bg-white/5 hover:bg-white/10 transition-colors border border-white/10 hover:border-white/20"
                >
                  <Globe className="w-5 h-5 text-white/60" />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs text-white/50 mb-0.5">{copy.website}</div>
                    <div className="text-sm text-white/90 break-words">{(profileData as CreatorProfileData).contact!.website}</div>
                  </div>
                </a>
              )}
            </div>
          </div>
        )}

        {/* Past Brand Collaborations - ONLY if data exists */}
        {hasPastBrands && profileData && (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 max-w-2xl mx-auto mb-6">
            <h3 className="text-lg font-semibold text-white mb-4">{copy.pastCollaborations}</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {(profileData as CreatorProfileData).pastBrands!.map((brand: { id: string; name: string; logoUrl?: string }) => (
                <div
                  key={brand.id}
                  className="rounded-lg border border-white/10 bg-white/5 p-4 text-center"
                >
                  {brand.logoUrl ? (
                    <img
                      src={brand.logoUrl}
                      alt={brand.name}
                      className="w-full h-12 object-contain mb-2"
                    />
                  ) : (
                    <div className="text-sm font-medium text-white/80">{brand.name}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Coming Soon Notice - ONLY if no real data */}
        {!hasAnyRealData && (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 sm:p-8 text-center max-w-2xl mx-auto space-y-6">
            <div className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-200 border border-amber-400/20">
              {copy.comingSoon}
            </div>
            
            <p className="text-base text-white/70 leading-relaxed">
              {copy.description}
            </p>

            {/* Creator ID Display */}
            {creatorId && (
              <div className="pt-4 border-t border-white/10">
                <div className="text-sm text-white/50 mb-2">{copy.idLabel}</div>
                <div className="text-base font-mono text-white/80 break-words px-4 py-2 rounded-lg bg-white/5 border border-white/10">
                  {creatorId}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Back to Matchmaking */}
        <div className="mt-8 text-center">
          <Link href={`/${resolvedParams.locale}/matchmaking`}>
            <Button
              variant="outline"
              size="lg"
              className="border-white/10 text-white/80 hover:bg-white/5"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              {copy.back}
            </Button>
          </Link>
        </div>
      </div>
    </div>
  )
}
