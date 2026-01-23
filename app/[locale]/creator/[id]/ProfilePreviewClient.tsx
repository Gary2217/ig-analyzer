"use client"

import React, { useEffect, useState } from "react"
import Image from "next/image"
import { CheckCircle2 } from "lucide-react"

interface CreatorPreviewData {
  id: string
  displayName: string
  avatarUrl: string
  category: string
  followerCount: number
  engagementRate: number | null
  isVerified: boolean
  profileUrl: string
  creatorSlug: string
  ts: number
}

interface ProfilePreviewClientProps {
  creatorId: string
  locale: "zh-TW" | "en"
}

export function ProfilePreviewClient({ creatorId, locale }: ProfilePreviewClientProps) {
  const [previewData, setPreviewData] = useState<CreatorPreviewData | null>(null)

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem("last_viewed_creator_v1")
      if (stored) {
        const data = JSON.parse(stored) as CreatorPreviewData
        // Only show if it matches current creator and is recent (< 5 minutes)
        const isRecent = Date.now() - data.ts < 5 * 60 * 1000
        const matchesId = data.creatorSlug === creatorId
        if (isRecent && matchesId) {
          setPreviewData(data)
        }
      }
    } catch {
      // Ignore sessionStorage errors
    }
  }, [creatorId])

  if (!previewData) return null

  const copy = locale === "zh-TW"
    ? {
        verified: "已驗證",
        followers: "追蹤者",
        engagement: "互動率",
      }
    : {
        verified: "Verified",
        followers: "Followers",
        engagement: "Engagement",
      }

  const formatFollowerCount = (count: number): string => {
    if (count >= 1000000) {
      return `${(count / 1000000).toFixed(1)}M`
    }
    if (count >= 1000) {
      return `${(count / 1000).toFixed(1)}K`
    }
    return count.toString()
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
      {/* Avatar */}
      <div className="relative w-24 h-24 mx-auto rounded-full overflow-hidden bg-white/10">
        <Image
          src={previewData.avatarUrl}
          alt={previewData.displayName}
          fill
          className="object-cover"
          sizes="96px"
        />
      </div>

      {/* Name + Verified */}
      <div className="text-center space-y-1">
        <div className="flex items-center justify-center gap-2">
          <h3 className="text-xl font-bold text-white">{previewData.displayName}</h3>
          {previewData.isVerified && (
            <CheckCircle2 className="w-5 h-5 text-sky-400" aria-label={copy.verified} />
          )}
        </div>
        <p className="text-sm text-white/60">{previewData.category}</p>
      </div>

      {/* Quick Metrics */}
      <div className="flex items-center justify-center gap-6 text-sm">
        <div className="text-center">
          <div className="font-semibold text-white tabular-nums">
            {formatFollowerCount(previewData.followerCount)}
          </div>
          <div className="text-xs text-white/50">{copy.followers}</div>
        </div>
        {previewData.engagementRate !== null && (
          <div className="text-center">
            <div className="font-semibold text-white tabular-nums">
              {previewData.engagementRate}%
            </div>
            <div className="text-xs text-white/50">{copy.engagement}</div>
          </div>
        )}
      </div>
    </div>
  )
}
