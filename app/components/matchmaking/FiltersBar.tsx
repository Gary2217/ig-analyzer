"use client"

import { useMemo, useState } from "react"
import type { BudgetRange, Platform, TypeKey } from "./types"
import { getCopy, type Locale } from "@/app/i18n"

type Props = {
  locale: Locale
  search: string
  onSearch: (v: string) => void

  platform: Platform | "any"
  onPlatform: (v: Platform | "any") => void

  platformOptions: Array<{ value: Platform | "any"; label: string }>

  budget: BudgetRange
  onBudget: (v: BudgetRange) => void

  customBudget: string
  onCustomBudget: (v: string) => void
  onClearCustomBudget: () => void

  selectedTypes: TypeKey[]
  onToggleType: (t: TypeKey) => void
  onClearTypes: () => void
  typeOptions: Array<{ value: TypeKey | "any"; label: string }>

  sort: "best_match" | "followers_desc" | "er_desc"
  onSort: (v: "best_match" | "followers_desc" | "er_desc") => void

  favoritesCount: number
  onOpenFavorites: () => void

  statsUpdating?: boolean
}

export function FiltersBar(props: Props) {
  const copy = getCopy(props.locale)
  const mm = copy.matchmaking
  const [chipsExpanded, setChipsExpanded] = useState(false)
  const [mobileExpanded, setMobileExpanded] = useState(false)

  const budgetLabelFor = (range: Exclude<BudgetRange, "any" | "custom">) => {
    const isZh = props.locale === "zh-TW"
    if (range === "1000") return "1,000"
    if (range === "3000") return "3,000"
    if (range === "1000_5000") return isZh ? "1,000～5,000" : "1,000–5,000"
    if (range === "5000_10000") return isZh ? "5,000～1萬" : "5,000–10,000"
    if (range === "10000_30000") return isZh ? "1萬～3萬" : "10,000–30,000"
    if (range === "30000_60000") return isZh ? "3萬～6萬" : "30,000–60,000"
    if (range === "60000_100000") return isZh ? "6萬～10萬" : "60,000–100,000"
    if (range === "100000_plus") return isZh ? "10萬以上" : "100,000+"
    return String(range)
  }

  const budgetOptions: Array<{ value: BudgetRange; label: string }> = useMemo(
    () => [
      { value: "any", label: mm.anyBudget },
      { value: "custom", label: mm.budgetOtherAmount },
      { value: "1000", label: budgetLabelFor("1000") },
      { value: "3000", label: budgetLabelFor("3000") },
      { value: "1000_5000", label: budgetLabelFor("1000_5000") },
      { value: "5000_10000", label: budgetLabelFor("5000_10000") },
      { value: "10000_30000", label: budgetLabelFor("10000_30000") },
      { value: "30000_60000", label: budgetLabelFor("30000_60000") },
      { value: "60000_100000", label: budgetLabelFor("60000_100000") },
      { value: "100000_plus", label: budgetLabelFor("100000_plus") },
    ],
    [mm, props.locale]
  )

  const chipOptions = useMemo(
    () => props.typeOptions.filter((o) => o.value !== "any") as Array<{ value: TypeKey; label: string }>,
    [props.typeOptions]
  )

  const chipsCollapsedCount = 6
  const visibleChips = chipsExpanded ? chipOptions : chipOptions.slice(0, chipsCollapsedCount)
  const hiddenCount = Math.max(0, chipOptions.length - visibleChips.length)

  return (
    <div className="w-full max-w-[1400px] mx-auto px-3 sm:px-6">
      <div className="flex flex-col gap-3">
        <div className="sticky top-[52px] sm:top-[72px] z-40 -mx-3 sm:mx-0 px-3 sm:px-0">
          <div className="rounded-2xl border border-white/10 bg-[#0b1220]/75 backdrop-blur-md">
            <div className="p-3 sm:p-4">
              <div className="flex flex-wrap items-center gap-2.5 min-w-0">
                <input
                  value={props.search}
                  onChange={(e) => props.onSearch(e.target.value)}
                  placeholder={copy.common.searchPlaceholder}
                  className="h-11 w-full sm:flex-1 min-w-0 rounded-lg bg-white/5 border border-white/10 px-3 text-sm text-white/90 placeholder:text-white/30"
                />

                <button
                  type="button"
                  onClick={() => setMobileExpanded((v) => !v)}
                  className="h-11 w-full sm:hidden px-4 rounded-lg border border-white/10 bg-white/5 text-sm text-white/85 hover:bg-white/10 whitespace-nowrap"
                  aria-expanded={mobileExpanded}
                >
                  {mm.filtersButton}
                </button>

                <select
                  value={props.platform}
                  onChange={(e) => props.onPlatform(e.target.value as any)}
                  className="h-11 w-full sm:w-auto min-w-0 sm:min-w-[140px] max-w-full rounded-lg bg-white/5 border border-white/10 px-3 text-sm text-white/90 hidden sm:block"
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
                  className="h-11 w-full sm:w-auto min-w-0 sm:min-w-[140px] max-w-full sm:max-w-none rounded-lg bg-white/5 border border-white/10 px-3 text-sm text-white/90 hidden sm:block"
                >
                  {budgetOptions.map((o) => (
                    <option key={o.value} value={o.value} className="bg-slate-900">
                      {o.label}
                    </option>
                  ))}
                </select>

                <select
                  value={props.sort}
                  onChange={(e) => props.onSort(e.target.value as any)}
                  className="h-11 w-full sm:w-auto min-w-0 sm:min-w-[180px] max-w-full rounded-lg bg-white/5 border border-white/10 px-3 text-sm text-white/90 hidden sm:block"
                >
                  <option value="best_match" className="bg-slate-900">
                    {mm.sortBestMatch}
                  </option>
                  <option value="followers_desc" className="bg-slate-900">
                    {mm.sortFollowersDesc}
                  </option>
                  <option value="er_desc" className="bg-slate-900">
                    {mm.sortErDesc}
                  </option>
                </select>

                <button
                  type="button"
                  onClick={props.onOpenFavorites}
                  className="h-11 w-full sm:w-auto px-4 rounded-lg border border-white/10 bg-white/5 text-sm text-white/80 hover:bg-white/10 whitespace-nowrap"
                >
                  {copy.common.favorites} ({props.favoritesCount})
                </button>
              </div>

              <div className={mobileExpanded ? "mt-3 sm:mt-0" : "mt-0 sm:mt-0"}>
                <div className={`${mobileExpanded ? "block" : "hidden"} sm:block`}>
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
                    <select
                      value={props.platform}
                      onChange={(e) => props.onPlatform(e.target.value as any)}
                      className="h-11 w-full min-w-0 rounded-lg bg-white/5 border border-white/10 px-3 text-sm text-white/90 sm:hidden"
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
                      className="h-11 w-full min-w-0 rounded-lg bg-white/5 border border-white/10 px-3 text-sm text-white/90 sm:hidden"
                    >
                      {budgetOptions.map((o) => (
                        <option key={o.value} value={o.value} className="bg-slate-900">
                          {o.label}
                        </option>
                      ))}
                    </select>

                    <select
                      value={props.sort}
                      onChange={(e) => props.onSort(e.target.value as any)}
                      className="h-11 w-full min-w-0 rounded-lg bg-white/5 border border-white/10 px-3 text-sm text-white/90 sm:hidden"
                    >
                      <option value="best_match" className="bg-slate-900">
                        {mm.sortBestMatch}
                      </option>
                      <option value="followers_desc" className="bg-slate-900">
                        {mm.sortFollowersDesc}
                      </option>
                      <option value="er_desc" className="bg-slate-900">
                        {mm.sortErDesc}
                      </option>
                    </select>
                  </div>
                </div>
              </div>

              {props.sort === "best_match" ? (
                <div className="mt-2 text-xs sm:text-sm text-white/50 max-w-full break-words min-w-0">
                  {mm.bestMatchHelper}
                </div>
              ) : null}

              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-3 min-w-0">
                  {props.statsUpdating ? (
                    <div className="flex items-center gap-2 text-xs sm:text-sm text-white/50 min-w-0">
                      <div className="h-3 w-3 rounded-full border border-white/20 border-t-white/60 animate-spin shrink-0" />
                      <span className="truncate min-w-0">{mm.updatingStats}</span>
                    </div>
                  ) : null}
                </div>

                {props.selectedTypes.length ? (
                  <button
                    type="button"
                    onClick={props.onClearTypes}
                    className="h-11 px-4 rounded-lg border border-white/10 bg-white/5 text-sm text-white/70 hover:bg-white/10 whitespace-nowrap"
                  >
                    {copy.common.all}
                  </button>
                ) : null}
              </div>

              <div className={`mt-2 flex flex-wrap gap-2 min-w-0 ${mobileExpanded ? "" : "hidden sm:flex"}`}>
                {visibleChips.map((o) => {
                  const active = props.selectedTypes.includes(o.value)
                  return (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() => props.onToggleType(o.value)}
                      className={`h-11 px-3 rounded-full border text-sm whitespace-nowrap max-w-full truncate min-w-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/40 ${
                        active
                          ? "bg-gradient-to-r from-emerald-500/15 to-cyan-400/10 border-emerald-400/30 text-white/90 ring-1 ring-emerald-400/25"
                          : "bg-white/5 border-white/10 text-white/70 hover:bg-white/[0.08] hover:text-white/85"
                      }`}
                    >
                      {o.label}
                    </button>
                  )
                })}

                {!chipsExpanded && hiddenCount ? (
                  <button
                    type="button"
                    onClick={() => setChipsExpanded(true)}
                    className="h-11 px-3 rounded-full border border-white/10 bg-white/5 text-sm text-white/70 hover:bg-white/[0.08] hover:text-white/85 whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/40"
                  >
                    {mm.showMoreChips(hiddenCount)}
                  </button>
                ) : null}

                {chipsExpanded && chipOptions.length > chipsCollapsedCount ? (
                  <button
                    type="button"
                    onClick={() => setChipsExpanded(false)}
                    className="h-11 px-3 rounded-full border border-white/10 bg-white/5 text-sm text-white/70 hover:bg-white/[0.08] hover:text-white/85 whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/40"
                  >
                    {mm.showLessChips}
                  </button>
                ) : null}
              </div>

              {props.budget === "custom" ? (
                <div className="mt-2 grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
                  <input
                    inputMode="numeric"
                    value={props.customBudget}
                    onChange={(e) => {
                      const next = e.target.value.replace(/[^0-9]/g, "").slice(0, 9)
                      props.onCustomBudget(next)
                    }}
                    placeholder={mm.budgetCustomPlaceholder}
                    className="h-11 w-full rounded-lg bg-white/5 border border-white/10 px-3 text-sm text-white/90 placeholder:text-white/30"
                  />
                  <button
                    type="button"
                    onClick={props.onClearCustomBudget}
                    className="h-11 px-4 rounded-lg border border-white/10 bg-white/5 text-sm text-white/80 hover:bg-white/10"
                  >
                    {mm.budgetClearCustom}
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
