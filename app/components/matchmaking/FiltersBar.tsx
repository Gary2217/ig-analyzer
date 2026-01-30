"use client"

import { useMemo } from "react"
import type { BudgetRange, CollabType, FormatKey, Platform } from "./types"
import { getCopy, type Locale } from "@/app/i18n"

type Props = {
  locale: Locale
  search: string
  onSearch: (v: string) => void

  platform: Platform | "any"
  onPlatform: (v: Platform | "any") => void

  platformOptions: Array<{ value: Platform | "any"; label: string }>

  format: FormatKey | "any"
  onFormat: (v: FormatKey | "any") => void
  formatOptions: Array<{ value: FormatKey | "any"; label: string }>

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
  const copy = getCopy(props.locale)
  const mm = copy.matchmaking

  const budgetOptions: Array<{ value: BudgetRange; label: string }> = useMemo(
    () => [
      { value: "any", label: mm.anyBudget },
      { value: "0_5000", label: "≤ 5,000" },
      { value: "5000_10000", label: "5,000–10,000" },
      { value: "10000_30000", label: "10,000–30,000" },
      { value: "30000_60000", label: "30,000–60,000" },
      { value: "60000_plus", label: "60,000+" },
    ],
    [mm]
  )

  const collabOptions: Array<{ value: CollabType | "any"; label: string }> = useMemo(
    () => [
      { value: "any", label: mm.allTypes },
      { value: "short_video", label: props.locale === "zh-TW" ? "短影音" : "Short Video" },
      { value: "long_video", label: props.locale === "zh-TW" ? "長影音" : "Long Video" },
      { value: "live", label: props.locale === "zh-TW" ? "直播" : "Live" },
      { value: "ugc", label: "UGC" },
      { value: "review_unboxing", label: props.locale === "zh-TW" ? "開箱 / 評測" : "Review/Unboxing" },
      { value: "event", label: props.locale === "zh-TW" ? "活動" : "Event" },
      { value: "other", label: props.locale === "zh-TW" ? "其他" : "Other" },
    ],
    [mm, props.locale]
  )

  return (
    <div className="w-full max-w-[1200px] mx-auto px-3 sm:px-6">
      <div className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-lg sm:text-xl font-semibold text-white/90">{mm.title}</h1>
            <p className="text-xs sm:text-sm text-white/50">
              {mm.description}
            </p>
          </div>
          <div className="text-xs sm:text-sm text-white/60 tabular-nums whitespace-nowrap">
            {mm.totalCreators(props.total)}
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-7 gap-2">
          <input
            value={props.search}
            onChange={(e) => props.onSearch(e.target.value)}
            placeholder={copy.common.searchPlaceholder}
            className="col-span-2 lg:col-span-2 h-11 rounded-lg bg-white/5 border border-white/10 px-3 text-sm text-white/90 placeholder:text-white/30"
          />

          <select
            value={props.platform}
            onChange={(e) => props.onPlatform(e.target.value as any)}
            className="h-11 rounded-lg bg-white/5 border border-white/10 px-3 text-sm text-white/90"
          >
            {props.platformOptions.map((o) => (
              <option key={o.value} value={o.value} className="bg-slate-900">
                {o.label}
              </option>
            ))}
          </select>

          <select
            value={props.budget}
            onChange={(e) => props.onBudget(e.target.value as any)}
            className="h-11 rounded-lg bg-white/5 border border-white/10 px-3 text-sm text-white/90"
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
            className="h-11 rounded-lg bg-white/5 border border-white/10 px-3 text-sm text-white/90"
          >
            {collabOptions.map((o) => (
              <option key={o.value} value={o.value} className="bg-slate-900">
                {o.label}
              </option>
            ))}
          </select>

          <select
            value={props.format}
            onChange={(e) => props.onFormat(e.target.value as any)}
            className="h-11 rounded-lg bg-white/5 border border-white/10 px-3 text-sm text-white/90"
          >
            {props.formatOptions.map((o) => (
              <option key={o.value} value={o.value} className="bg-slate-900">
                {o.label}
              </option>
            ))}
          </select>

          <div className="grid grid-cols-2 gap-2">
            <select
              value={props.category}
              onChange={(e) => props.onCategory(e.target.value)}
              className="h-11 rounded-lg bg-white/5 border border-white/10 px-3 text-sm text-white/90"
            >
              {(props.categoryOptions?.length ? props.categoryOptions : ["all"]).map((c) => (
                <option key={c} value={c} className="bg-slate-900">
                  {c === "all" ? mm.allCategories : c}
                </option>
              ))}
            </select>

            <select
              value={props.sort}
              onChange={(e) => props.onSort(e.target.value)}
              className="h-11 rounded-lg bg-white/5 border border-white/10 px-3 text-sm text-white/90"
            >
              <option value="recommended" className="bg-slate-900">
                {mm.sortRecommended}
              </option>
              <option value="newest" className="bg-slate-900">
                {mm.sortNewest}
              </option>
              <option value="name" className="bg-slate-900">
                {mm.sortName}
              </option>
              <option value="followers_desc" className="bg-slate-900">
                {mm.sortFollowers}
              </option>
              <option value="er_desc" className="bg-slate-900">
                {mm.sortEngagement}
              </option>
            </select>
          </div>
        </div>
      </div>
    </div>
  )
}
