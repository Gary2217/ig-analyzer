"use client"

import { useMemo } from "react"
import type { BudgetRange, CollabType, Platform } from "./types"

type Props = {
  search: string
  onSearch: (v: string) => void

  platform: Platform | "any"
  onPlatform: (v: Platform | "any") => void

  budget: BudgetRange
  onBudget: (v: BudgetRange) => void

  collab: CollabType | "any"
  onCollab: (v: CollabType | "any") => void

  category: string
  categoryOptions: string[]
  onCategory: (v: string) => void

  sort: string
  onSort: (v: string) => void

  total: number
}

export function FiltersBar(props: Props) {
  const platformOptions: Array<{ value: Platform | "any"; label: string }> = useMemo(
    () => [
      { value: "any", label: "All Platforms" },
      { value: "instagram", label: "Instagram" },
      { value: "tiktok", label: "TikTok" },
      { value: "youtube", label: "YouTube" },
      { value: "facebook", label: "Facebook" },
    ],
    []
  )

  const budgetOptions: Array<{ value: BudgetRange; label: string }> = useMemo(
    () => [
      { value: "any", label: "Any Budget" },
      { value: "0_5000", label: "≤ 5,000" },
      { value: "5000_10000", label: "5,000–10,000" },
      { value: "10000_30000", label: "10,000–30,000" },
      { value: "30000_60000", label: "30,000–60,000" },
      { value: "60000_plus", label: "60,000+" },
    ],
    []
  )

  const collabOptions: Array<{ value: CollabType | "any"; label: string }> = useMemo(
    () => [
      { value: "any", label: "All Types" },
      { value: "short_video", label: "Short Video" },
      { value: "long_video", label: "Long Video" },
      { value: "live", label: "Live" },
      { value: "ugc", label: "UGC" },
      { value: "review_unboxing", label: "Review/Unboxing" },
      { value: "event", label: "Event" },
      { value: "other", label: "Other" },
    ],
    []
  )

  return (
    <div className="w-full max-w-[1200px] mx-auto px-3 sm:px-6">
      <div className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-lg sm:text-xl font-semibold text-white/90">Matchmaking</h1>
            <p className="text-xs sm:text-sm text-white/50">
              Filter creators by platform, budget, and collaboration type.
            </p>
          </div>
          <div className="text-xs sm:text-sm text-white/60">{props.total} creators</div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2">
          <input
            value={props.search}
            onChange={(e) => props.onSearch(e.target.value)}
            placeholder="Search name / handle / keyword..."
            className="lg:col-span-2 h-10 rounded-lg bg-white/5 border border-white/10 px-3 text-sm text-white/90 placeholder:text-white/30"
          />

          <select
            value={props.platform}
            onChange={(e) => props.onPlatform(e.target.value as any)}
            className="h-10 rounded-lg bg-white/5 border border-white/10 px-3 text-sm text-white/90"
          >
            {platformOptions.map((o) => (
              <option key={o.value} value={o.value} className="bg-slate-900">
                {o.label}
              </option>
            ))}
          </select>

          <select
            value={props.budget}
            onChange={(e) => props.onBudget(e.target.value as any)}
            className="h-10 rounded-lg bg-white/5 border border-white/10 px-3 text-sm text-white/90"
          >
            {budgetOptions.map((o) => (
              <option key={o.value} value={o.value} className="bg-slate-900">
                {o.label}
              </option>
            ))}
          </select>

          <select
            value={props.collab}
            onChange={(e) => props.onCollab(e.target.value as any)}
            className="h-10 rounded-lg bg-white/5 border border-white/10 px-3 text-sm text-white/90"
          >
            {collabOptions.map((o) => (
              <option key={o.value} value={o.value} className="bg-slate-900">
                {o.label}
              </option>
            ))}
          </select>

          <div className="grid grid-cols-2 gap-2">
            <select
              value={props.category}
              onChange={(e) => props.onCategory(e.target.value)}
              className="h-10 rounded-lg bg-white/5 border border-white/10 px-3 text-sm text-white/90"
            >
              {(props.categoryOptions?.length ? props.categoryOptions : ["all"]).map((c) => (
                <option key={c} value={c} className="bg-slate-900">
                  {c === "all" ? "All Categories" : c}
                </option>
              ))}
            </select>

            <select
              value={props.sort}
              onChange={(e) => props.onSort(e.target.value)}
              className="h-10 rounded-lg bg-white/5 border border-white/10 px-3 text-sm text-white/90"
            >
              <option value="recommended" className="bg-slate-900">
                Recommended
              </option>
              <option value="newest" className="bg-slate-900">
                Newest
              </option>
              <option value="name" className="bg-slate-900">
                Name A–Z
              </option>
              <option value="followers_desc" className="bg-slate-900">
                Followers (High)
              </option>
              <option value="er_desc" className="bg-slate-900">
                Engagement Rate (High)
              </option>
            </select>
          </div>
        </div>
      </div>
    </div>
  )
}
