import Link from "next/link"
import Image from "next/image"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { createPublicClient } from "@/lib/supabase/server"
import { CollabAutoScroll } from "./CollabAutoScroll"

interface CreatorProfilePageProps {
  params: Promise<{
    locale: string
    id: string
  }>
}

interface CreatorCardData {
  id: string
  ig_username: string | null
  niche: string | null
  profile_image_url: string | null
  updated_at: string | null
  is_public: boolean
  audience: string | null
  theme_types: string[] | null
  audience_profiles: string[] | null
  deliverables: string[] | null
  collaboration_niches: string[] | null
  past_collaborations: string[] | null
  portfolio: unknown[] | null
}

async function fetchCreatorCard(id: string): Promise<CreatorCardData | null> {
  try {
    const supabase = createPublicClient()

    const { data, error } = await supabase
      .from("creator_cards")
      .select("id, ig_username, niche, profile_image_url, updated_at, is_public, audience, theme_types, audience_profiles, deliverables, collaboration_niches, past_collaborations, portfolio")
      .eq("id", id)
      .eq("is_public", true)
      .maybeSingle()

    if (error) {
      console.error("Error fetching creator card:", error)
      return null
    }

    return data
  } catch (error) {
    console.error("Error fetching creator card:", error)
    return null
  }
}

export default async function CreatorProfilePage({ params, searchParams }: CreatorProfilePageProps & { searchParams?: Promise<{ tab?: string }> }) {
  const resolvedParams = await params
  const resolvedSearchParams = searchParams ? await searchParams : undefined
  const locale = resolvedParams.locale === "zh-TW" ? "zh-TW" : "en"
  const creatorId = resolvedParams.id
  const tab = resolvedSearchParams?.tab

  // Fetch creator card data
  const cardData = await fetchCreatorCard(creatorId)

  const copy = locale === "zh-TW"
    ? {
        title: "創作者名片",
        back: "返回",
        notFound: "找不到此創作者",
        notFoundDesc: "此創作者名片不存在或尚未公開。",
        displayName: "顯示名稱",
        category: "分類",
        idLabel: "代號",
        showcase: "個人展示",
        showcaseSubtitle: "作品集／合作案例／熱門內容",
        portfolio: "作品集",
        portfolioSubtitle: "精選合作與代表作品",
        portfolioEmpty: "尚未新增作品集",
        about: "關於我",
        themes: "內容主題",
        audienceProfiles: "受眾輪廓",
        deliverables: "合作項目",
        collabTypes: "合作類型",
        pastBrands: "合作品牌",
        collab: "合作洽談",
        collabDesc: "此創作者尚未公開聯絡方式。你可以先送出合作提案，之後再由系統通知對方。",
        collabHint: "已為你定位到合作區塊，請填寫表單送出提案。",
        brandName: "你的品牌/公司名稱",
        contactInfo: "你的聯絡方式（Email/LINE）",
        proposal: "合作需求簡述（檔期、預算、形式…）",
        submit: "送出合作提案",
      }
    : {
        title: "Creator Profile",
        back: "Back",
        notFound: "Creator Not Found",
        notFoundDesc: "This creator profile does not exist or is not public.",
        displayName: "Display Name",
        category: "Category",
        idLabel: "ID",
        showcase: "Showcase",
        showcaseSubtitle: "Portfolio · Case Studies · Top Content",
        portfolio: "Portfolio",
        portfolioSubtitle: "Selected collaborations & works",
        portfolioEmpty: "No portfolio items yet",
        about: "About",
        themes: "Content Themes",
        audienceProfiles: "Audience",
        deliverables: "Deliverables",
        collabTypes: "Collaboration Types",
        pastBrands: "Past Collaborations",
        collab: "Collaboration",
        collabDesc: "This creator has not shared contact info yet. You can submit a collaboration proposal and we'll notify them.",
        collabHint: "You're in collaboration mode. Fill the form to send a proposal.",
        brandName: "Your Brand/Company Name",
        contactInfo: "Your Contact (Email/LINE)",
        proposal: "Collaboration Details (timeline, budget, format...)",
        submit: "Submit Proposal",
      }

  // If card not found or not public, show error state
  if (!cardData) {
    return (
      <div className="min-h-[calc(100dvh-80px)] w-full">
        <div className="w-full max-w-4xl mx-auto px-4 py-8 sm:py-12">
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

          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 sm:p-8 text-center max-w-2xl mx-auto space-y-4">
            <h2 className="text-2xl font-bold text-white">{copy.notFound}</h2>
            <p className="text-base text-white/70 leading-relaxed">{copy.notFoundDesc}</p>
            <div className="pt-4">
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
      </div>
    )
  }

  const displayName = cardData.ig_username || cardData.id
  const category = cardData.niche || (locale === "zh-TW" ? "創作者" : "Creator")
  const isCollab = tab === "collab"

  // Safe portfolio normalization
  const portfolioItems = (() => {
    if (!cardData.portfolio) return []
    if (Array.isArray(cardData.portfolio)) return cardData.portfolio
    if (typeof cardData.portfolio === "object" && Array.isArray((cardData.portfolio as any).items)) {
      return (cardData.portfolio as any).items
    }
    return []
  })()

  // Normalize portfolio item to support multiple shapes
  const normalizePortfolioItem = (item: any) => {
    if (!item || typeof item !== "object") return null

    // Extract fields with fallbacks for different key variants
    const brand = typeof item.brand === "string" ? item.brand.trim() : ""
    const collabType = typeof item.collabType === "string" ? item.collabType.trim() : typeof item.collabtype === "string" ? item.collabtype.trim() : ""
    const title = typeof item.title === "string" ? item.title.trim() : ""
    const platform = typeof item.platform === "string" ? item.platform.trim() : ""
    
    // Image URL with multiple fallbacks
    const thumbnailUrl = typeof item.thumbnail === "string" ? item.thumbnail.trim() :
                        typeof item.url === "string" ? item.url.trim() :
                        typeof item.imageUrl === "string" ? item.imageUrl.trim() :
                        typeof item.image_url === "string" ? item.image_url.trim() : ""
    
    // Click URL
    const clickUrl = typeof item.link === "string" ? item.link.trim() :
                     typeof item.clickUrl === "string" ? item.clickUrl.trim() : ""

    // Map to unified shape:
    // Priority: explicit title > brand, explicit platform > collabType
    const displayTitle = title || brand
    const displaySubtitle = collabType
    const platformLabel = platform || collabType

    // Skip if completely empty
    if (!displayTitle && !displaySubtitle && !thumbnailUrl && !platformLabel) return null

    return {
      displayTitle,
      displaySubtitle,
      thumbnailUrl,
      clickUrl,
      platformLabel,
    }
  }

  // Tag localization map
  const TAG_LABELS: Record<string, { "zh-TW": string; en: string }> = {
    // Content themes
    beauty: { "zh-TW": "美妝", en: "Beauty" },
    fitness: { "zh-TW": "健身", en: "Fitness" },
    gaming: { "zh-TW": "遊戲", en: "Gaming" },
    education: { "zh-TW": "教育", en: "Education" },
    lifestyle: { "zh-TW": "生活風格", en: "Lifestyle" },
    fashion: { "zh-TW": "時尚", en: "Fashion" },
    food: { "zh-TW": "美食", en: "Food" },
    travel: { "zh-TW": "旅遊", en: "Travel" },
    tech: { "zh-TW": "科技", en: "Tech" },
    music: { "zh-TW": "音樂", en: "Music" },
    art: { "zh-TW": "藝術", en: "Art" },
    photography: { "zh-TW": "攝影", en: "Photography" },
    comedy: { "zh-TW": "喜劇", en: "Comedy" },
    sports: { "zh-TW": "運動", en: "Sports" },
    business: { "zh-TW": "商業", en: "Business" },
    parenting: { "zh-TW": "親子育兒", en: "Parenting" },
    pets: { "zh-TW": "寵物", en: "Pets" },
    diy: { "zh-TW": "手作DIY", en: "DIY" },
    finance: { "zh-TW": "理財", en: "Finance" },
    health: { "zh-TW": "健康", en: "Health" },
    // Deliverables (collab items)
    reels: { "zh-TW": "Reels／短影音", en: "Reels" },
    ugc: { "zh-TW": "UGC（用戶生成內容）", en: "UGC" },
    posts: { "zh-TW": "貼文", en: "Posts" },
    stories: { "zh-TW": "限時動態", en: "Stories" },
    live: { "zh-TW": "直播", en: "Live" },
    unboxing: { "zh-TW": "開箱", en: "Unboxing" },
    youtube: { "zh-TW": "YouTube", en: "YouTube" },
    tiktok: { "zh-TW": "TikTok", en: "TikTok" },
    affiliate: { "zh-TW": "聯盟行銷", en: "Affiliate" },
    event: { "zh-TW": "活動", en: "Event" },
    giveaway: { "zh-TW": "抽獎", en: "Giveaway" },
    fb_post: { "zh-TW": "Facebook貼文", en: "Facebook Post" },
  }

  const getLocalizedTag = (tag: string): string => {
    const normalized = tag.toLowerCase().trim().replace(/\s+/g, "_")
    return TAG_LABELS[normalized]?.[locale] ?? tag
  }

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

        {/* Card Header Section */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 max-w-2xl mx-auto mb-6">
          <div className="flex flex-col sm:flex-row gap-6">
            {/* Avatar */}
            <div className="relative w-32 h-32 mx-auto sm:mx-0 shrink-0 rounded-xl overflow-hidden bg-white/10">
              {cardData.profile_image_url ? (
                <Image
                  src={cardData.profile_image_url}
                  alt={displayName}
                  fill
                  className="object-cover"
                  sizes="128px"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-white/40 text-4xl font-bold">
                  {displayName.charAt(0).toUpperCase()}
                </div>
              )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0 text-center sm:text-left">
              <h2 className="text-2xl font-bold text-white mb-2 break-words">
                {displayName}
              </h2>
              <p className="text-base text-white/60 mb-4">{category}</p>
              
              {/* ID */}
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10">
                <span className="text-xs text-white/50">{copy.idLabel}:</span>
                <span className="text-xs font-mono text-white/80 break-all">{cardData.id}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Portfolio Section */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-5 max-w-2xl mx-auto mb-4">
          <div className="mb-3">
            <h3 className="text-lg font-semibold text-white mb-1">{copy.portfolio}</h3>
            <p className="text-xs text-white/50">{copy.portfolioSubtitle}</p>
          </div>
          
          {portfolioItems.length > 0 ? (
            <div className="overflow-x-auto -mx-4 sm:-mx-5 px-4 sm:px-5 scrollbar-hide snap-x snap-mandatory">
              <div className="flex gap-5 pb-2">
                {portfolioItems.map((item: any, index: number) => {
                  const normalized = normalizePortfolioItem(item)
                  if (!normalized) return null

                  const { displayTitle, displaySubtitle, thumbnailUrl, clickUrl, platformLabel } = normalized
                  
                  const CardContent = (
                    <>
                      {/* Thumbnail */}
                      <div className="relative w-full aspect-video rounded-2xl overflow-hidden bg-white/10 border border-white/20 mb-3">
                        {thumbnailUrl ? (
                          <img
                            src={thumbnailUrl}
                            alt={displayTitle || "Portfolio item"}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-white/40 text-xs">
                            {platformLabel || "Work"}
                          </div>
                        )}
                      </div>
                      
                      {/* Title */}
                      {displayTitle && (
                        <div className="text-base sm:text-lg text-white/90 line-clamp-2 leading-tight mb-1">
                          {displayTitle}
                        </div>
                      )}
                      
                      {/* Subtitle / Platform Badge */}
                      {displaySubtitle && (
                        <div className="text-xs text-white/60 uppercase tracking-wide">
                          {getLocalizedTag(displaySubtitle)}
                        </div>
                      )}
                    </>
                  )
                  
                  return clickUrl && clickUrl.trim() !== "" ? (
                    <a
                      key={index}
                      href={clickUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-shrink-0 w-72 sm:w-80 rounded-xl bg-white/5 border border-white/10 p-5 hover:bg-white/10 hover:border-white/20 transition-colors snap-start"
                    >
                      {CardContent}
                    </a>
                  ) : (
                    <div
                      key={index}
                      className="flex-shrink-0 w-72 sm:w-80 rounded-xl bg-white/5 border border-white/10 p-5 snap-start"
                    >
                      {CardContent}
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            <div className="py-6 text-center">
              <div className="inline-block px-4 py-3 rounded-lg border border-dashed border-white/20 bg-white/5">
                <p className="text-xs text-white/50">{copy.portfolioEmpty}</p>
              </div>
              {process.env.NODE_ENV !== "production" && (
                <p className="text-[10px] text-white/30 mt-2">
                  debug: portfolio type = {typeof cardData.portfolio}, isArray = {Array.isArray(cardData.portfolio).toString()}, length = {portfolioItems.length}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Showcase Section */}
        {(cardData.theme_types?.length || cardData.audience_profiles?.length) && (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-5 max-w-2xl mx-auto mb-4">
            <div className="mb-4">
              <h2 className="text-xl font-semibold text-white mb-1">{copy.showcase}</h2>
              <p className="text-xs text-white/50">{copy.showcaseSubtitle}</p>
            </div>

            {/* Content Themes in Showcase */}
            {cardData.theme_types && cardData.theme_types.length > 0 && (
              <div className="mb-4 last:mb-0">
                <h3 className="text-sm font-medium text-white/70 mb-3">{copy.themes}</h3>
                <div className="flex flex-wrap gap-2">
                  {cardData.theme_types.map((theme, index) => (
                    <div
                      key={index}
                      className="px-3 py-1.5 rounded-lg bg-white/10 border border-white/10 text-sm text-white/90"
                    >
                      {getLocalizedTag(theme)}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Audience Profiles in Showcase */}
            {cardData.audience_profiles && cardData.audience_profiles.length > 0 && (
              <div className="mb-0">
                <h3 className="text-sm font-medium text-white/70 mb-3">{copy.audienceProfiles}</h3>
                <div className="flex flex-wrap gap-2">
                  {cardData.audience_profiles.map((profile, index) => (
                    <div
                      key={index}
                      className="px-3 py-1.5 rounded-lg bg-white/10 border border-white/10 text-sm text-white/90"
                    >
                      {getLocalizedTag(profile)}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* About Section */}
        {cardData.audience && cardData.audience.trim() && (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-5 max-w-2xl mx-auto mb-4">
            <h3 className="text-lg font-semibold text-white mb-3">{copy.about}</h3>
            <p className="text-sm text-white/80 leading-relaxed break-words whitespace-pre-wrap">
              {cardData.audience}
            </p>
          </div>
        )}


        {/* Deliverables Section */}
        {cardData.deliverables && cardData.deliverables.length > 0 && (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-5 max-w-2xl mx-auto mb-4">
            <h3 className="text-lg font-semibold text-white mb-3">{copy.deliverables}</h3>
            <div className="flex flex-wrap gap-2">
              {cardData.deliverables.map((item, index) => (
                <div
                  key={index}
                  className="px-3 py-1.5 rounded-lg bg-white/10 border border-white/10 text-sm text-white/90"
                >
                  {getLocalizedTag(item)}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Collaboration Types Section */}
        {cardData.collaboration_niches && cardData.collaboration_niches.length > 0 && (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-5 max-w-2xl mx-auto mb-4">
            <h3 className="text-lg font-semibold text-white mb-3">{copy.collabTypes}</h3>
            <div className="flex flex-wrap gap-2">
              {cardData.collaboration_niches.map((type, index) => (
                <div
                  key={index}
                  className="px-3 py-1.5 rounded-lg bg-white/10 border border-white/10 text-sm text-white/90"
                >
                  {getLocalizedTag(type)}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Past Collaborations Section */}
        {cardData.past_collaborations && cardData.past_collaborations.length > 0 && (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-5 max-w-2xl mx-auto mb-4">
            <h3 className="text-lg font-semibold text-white mb-3">{copy.pastBrands}</h3>
            <div className="flex flex-wrap gap-2">
              {cardData.past_collaborations.map((brand, index) => (
                <div
                  key={index}
                  className="px-3 py-1.5 rounded-lg bg-white/10 border border-white/10 text-sm text-white/90"
                >
                  {brand}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Collaboration Section */}
        <div 
          id="collab" 
          className={`rounded-2xl border p-4 sm:p-5 max-w-2xl mx-auto mb-4 transition-all ${
            isCollab 
              ? "ring-2 ring-white/20 border-white/20 bg-white/[0.07]" 
              : "border-white/10 bg-white/5"
          }`}
        >
          <h2 className="text-xl font-semibold text-white mb-3">{copy.collab}</h2>
          
          {isCollab && (
            <p className="text-sm text-amber-200/90 mb-4 leading-relaxed px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-400/20">
              {copy.collabHint}
            </p>
          )}
          
          <p className="text-sm text-white/70 mb-6 leading-relaxed">
            {copy.collabDesc}
          </p>

          <form className="space-y-4">
            <input
              type="text"
              placeholder={copy.brandName}
              data-collab-first="1"
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/20"
            />
            <input
              type="text"
              placeholder={copy.contactInfo}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/20"
            />
            <textarea
              placeholder={copy.proposal}
              rows={5}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/20 resize-none"
            />
            <button
              type="button"
              className="w-full rounded-xl bg-white/15 px-4 py-3 text-sm font-medium text-white/95 hover:bg-white/20 transition-colors"
            >
              {copy.submit}
            </button>
          </form>
        </div>

        {/* Auto-scroll handler */}
        <CollabAutoScroll tab={tab} />

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
