"use client"

import React from "react"
import { usePathname } from "next/navigation"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"

interface CreatorProfilePageProps {
  params: Promise<{
    locale: string
    id: string
  }>
}

export default function CreatorProfilePage({ params }: CreatorProfilePageProps) {
  const pathname = usePathname()
  const isZh = pathname?.startsWith("/zh-TW")
  const locale = isZh ? "zh-TW" : "en"

  // Unwrap params (Next.js 15+ async params pattern)
  const [resolvedParams, setResolvedParams] = React.useState<{ locale: string; id: string } | null>(null)

  React.useEffect(() => {
    params.then(setResolvedParams)
  }, [params])

  const copy = isZh
    ? {
        title: "創作者名片",
        comingSoon: "完整個人檔案即將推出",
        description: "我們正在建立完整的創作者個人檔案功能。敬請期待！",
        back: "返回",
        idLabel: "代號",
      }
    : {
        title: "Creator Profile",
        comingSoon: "Full profile coming soon",
        description: "We're building a complete creator profile experience. Stay tuned!",
        back: "Back",
        idLabel: "ID",
      }

  const creatorId = resolvedParams?.id || ""

  return (
    <div className="min-h-[calc(100dvh-80px)] w-full">
      <div className="w-full max-w-4xl mx-auto px-4 py-8 sm:py-12">
        {/* Back Button */}
        <div className="mb-6">
          <Link href={`/${locale}/matchmaking`}>
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

        {/* Coming Soon Notice */}
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

        {/* Back to Matchmaking */}
        <div className="mt-8 text-center">
          <Link href={`/${locale}/matchmaking`}>
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
