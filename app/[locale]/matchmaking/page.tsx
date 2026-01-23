"use client"

import { usePathname } from "next/navigation"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useAuthNavigation } from "@/app/lib/useAuthNavigation"
import { CreatorCardList } from "./components/CreatorCardList"
import { mockCreatorCards } from "./mockData"

export default function MatchmakingPage() {
  const pathname = usePathname()
  const isZh = pathname?.startsWith("/zh-TW")
  const { locale, navigateToResults, navigateToPostAnalysis, loading: authLoading } = useAuthNavigation()

  const copy = isZh
    ? {
        heading: "瀏覽創作者名片，開啟合作機會",
        comingSoon: "即將推出",
        description:
          "我們正在建立一個公開的創作者名片展示平台。品牌與創作者將能在此探索合作機會。",
        placeholderLabel: "創作者名片",
        back: "返回",
        accountAnalysis: "個人帳號分析",
        postAnalysis: "貼文分析",
      }
    : {
        heading: "Browse creator cards and collaborate",
        comingSoon: "Coming Soon",
        description:
          "We're building a public creator card showcase. Brands and creators will be able to discover collaboration opportunities here.",
        placeholderLabel: "Creator Card",
        back: "Back",
        accountAnalysis: "Account Analysis",
        postAnalysis: "Post Analysis",
      }

  function handleAnalyzeAccount() {
    if (authLoading) return
    navigateToResults()
  }

  function handleAnalyzePost() {
    if (authLoading) return
    navigateToPostAnalysis()
  }

  return (
    <div className="min-h-[calc(100dvh-220px)] w-full">
      <div className="w-full max-w-6xl mx-auto px-4 py-8 sm:py-12">
        {/* Header */}
        <div className="text-center mb-6 sm:mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold text-white tracking-tight max-w-3xl mx-auto text-balance">
            {copy.heading}
          </h1>
        </div>

        {/* Top Actions */}
        <div className="mb-8 sm:mb-10">
          <div className="flex flex-wrap items-center gap-3 justify-center">
            {/* Back Button */}
            <Link href={`/${locale}`}>
              <Button
                type="button"
                variant="secondary"
                size="default"
                className="h-11 px-4 min-w-[100px]"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                {copy.back}
              </Button>
            </Link>

            {/* Account Analysis Button */}
            <Button
              type="button"
              onClick={handleAnalyzeAccount}
              variant="primary"
              size="default"
              disabled={authLoading}
              className="h-11 px-4 min-w-[140px] bg-gradient-to-r from-sky-500 to-cyan-500 hover:from-sky-400 hover:to-cyan-400"
            >
              {copy.accountAnalysis}
            </Button>

            {/* Post Analysis Button */}
            <Button
              type="button"
              onClick={handleAnalyzePost}
              variant="primary"
              size="default"
              disabled={authLoading}
              className="h-11 px-4 min-w-[140px] bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-400 hover:to-pink-400"
            >
              {copy.postAnalysis}
            </Button>
          </div>
        </div>

        {/* Coming Soon Notice */}
        <div className="mb-8 rounded-2xl border border-white/10 bg-white/5 p-6 text-center max-w-2xl mx-auto">
          <div className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-200 border border-amber-400/20 mb-3">
            {copy.comingSoon}
          </div>
          <p className="text-sm text-white/60 leading-relaxed">
            {copy.description}
          </p>
        </div>

        {/* Creator Cards */}
        <CreatorCardList
          cards={mockCreatorCards}
          locale={isZh ? "zh-TW" : "en"}
          onViewProfile={(id) => {
            console.log("View creator profile:", id)
          }}
        />

        {/* Footer Note */}
        <div className="mt-12 text-center">
          <p className="text-xs text-white/40">
            {isZh
              ? "預覽模式：使用模擬數據展示"
              : "Preview Mode: Showing mock data"}
          </p>
        </div>
      </div>
    </div>
  )
}
