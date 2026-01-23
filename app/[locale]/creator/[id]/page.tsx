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
}

async function fetchCreatorCard(id: string): Promise<CreatorCardData | null> {
  try {
    const supabase = createPublicClient()

    const { data, error } = await supabase
      .from("creator_cards")
      .select("id, ig_username, niche, profile_image_url, updated_at, is_public")
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

        {/* Collaboration Section */}
        <div 
          id="collab" 
          className={`rounded-2xl border p-6 max-w-2xl mx-auto mb-6 transition-all ${
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
