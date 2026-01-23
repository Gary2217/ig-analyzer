"use client"

import { usePathname } from "next/navigation"
import { Card, CardContent } from "../../../components/ui/card"

export default function MatchmakingPage() {
  const pathname = usePathname()
  const isZh = pathname?.startsWith("/zh-TW")

  const copy = isZh
    ? {
        heading: "瀏覽創作者名片，開啟合作機會",
        comingSoon: "即將推出",
        description:
          "我們正在建立一個公開的創作者名片展示平台。品牌與創作者將能在此探索合作機會。",
        placeholderLabel: "創作者名片",
      }
    : {
        heading: "Browse creator cards and collaborate",
        comingSoon: "Coming Soon",
        description:
          "We're building a public creator card showcase. Brands and creators will be able to discover collaboration opportunities here.",
        placeholderLabel: "Creator Card",
      }

  return (
    <div className="min-h-[calc(100dvh-220px)] w-full">
      <div className="w-full max-w-6xl mx-auto px-4 py-8 sm:py-12">
        {/* Header */}
        <div className="text-center mb-8 sm:mb-12">
          <h1 className="text-3xl sm:text-4xl font-bold text-white tracking-tight max-w-3xl mx-auto text-balance">
            {copy.heading}
          </h1>
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

        {/* Placeholder Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card
              key={i}
              className="rounded-xl border border-white/10 bg-white/5 overflow-hidden"
            >
              <CardContent className="p-0">
                {/* Skeleton Avatar */}
                <div className="aspect-square bg-white/10 animate-pulse" />

                {/* Skeleton Content */}
                <div className="p-4 space-y-3">
                  <div className="h-5 bg-white/10 rounded animate-pulse w-3/4" />
                  <div className="h-4 bg-white/10 rounded animate-pulse w-full" />
                  <div className="h-4 bg-white/10 rounded animate-pulse w-5/6" />

                  <div className="pt-2 flex items-center gap-2">
                    <div className="h-8 bg-white/10 rounded animate-pulse flex-1" />
                    <div className="h-8 w-8 bg-white/10 rounded animate-pulse shrink-0" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Footer Note */}
        <div className="mt-8 text-center">
          <p className="text-xs text-white/40">
            {isZh
              ? "此功能正在開發中，敬請期待"
              : "This feature is under development"}
          </p>
        </div>
      </div>
    </div>
  )
}
