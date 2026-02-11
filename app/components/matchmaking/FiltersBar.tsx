"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import type { BudgetRange, CollabType, Platform } from "./types"
import { getCopy, type Locale } from "@/app/i18n"

type Props = {
  locale: Locale
  search: string
  onSearch: (v: string) => void

  selectedPlatforms: Platform[]
  onTogglePlatform: (p: Platform) => void
  onClearPlatforms: () => void

  selectedTagCategories: string[]
  tagCategoryOptions: string[]
  onToggleTagCategory: (tag: string) => void
  onAddCustomTagCategory: (tag: string) => void
  onClearTagCategories: () => void

  budget: BudgetRange
  onBudget: (v: BudgetRange) => void

  customBudget: string
  onCustomBudget: (v: string) => void
  onClearCustomBudget: () => void

  selectedDealTypes: CollabType[]
  onToggleDealType: (t: CollabType) => void
  onClearDealTypes: () => void
  dealTypeOptions: Array<{ value: CollabType; label: string }>

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
  const [platformOpen, setPlatformOpen] = useState(false)
  const [tagsOpen, setTagsOpen] = useState(false)
  const [tagSearch, setTagSearch] = useState("")
  const [customTagDraft, setCustomTagDraft] = useState("")

  const closeAll = useCallback(() => {
    setPlatformOpen(false)
    setTagsOpen(false)
  }, [])

  const closeOthers = useCallback(
    (except: "platform" | "tags") => {
      if (except !== "platform") setPlatformOpen(false)
      if (except !== "tags") setTagsOpen(false)
    },
    []
  )

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement | null
      if (!t) return
      if (t.closest('[data-mm-filters="root"]')) return
      closeAll()
    }

    window.addEventListener("pointerdown", onPointerDown)
    return () => {
      window.removeEventListener("pointerdown", onPointerDown)
    }
  }, [closeAll])

  const clearLabel = props.locale === "zh-TW" ? "清除" : "Clear"
  const addLabel = props.locale === "zh-TW" ? "新增" : "Add"

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

  const platformOptions: Array<{ value: Platform; label: string }> = useMemo(() => {
    const order: Platform[] = ["instagram", "facebook", "youtube", "tiktok"]
    const labelFor = (p: Platform) => {
      if (p === "instagram") return mm.platformInstagram
      if (p === "tiktok") return mm.platformTikTok
      if (p === "youtube") return mm.platformYouTube
      return mm.platformFacebook
    }
    return order.map((p) => ({ value: p, label: labelFor(p) }))
  }, [mm.platformFacebook, mm.platformInstagram, mm.platformTikTok, mm.platformYouTube])

  const selectedPlatformLabel = useMemo(() => {
    if (!props.selectedPlatforms.length) return copy.common.all
    const map = new Map(platformOptions.map((o) => [o.value, o.label]))
    return props.selectedPlatforms
      .map((p) => map.get(p) ?? String(p))
      .slice(0, 3)
      .join(", ") + (props.selectedPlatforms.length > 3 ? ` +${props.selectedPlatforms.length - 3}` : "")
  }, [copy.common.all, platformOptions, props.selectedPlatforms])

  const selectedTagsLabel = useMemo(() => {
    if (!props.selectedTagCategories.length) return copy.common.all
    return props.selectedTagCategories.slice(0, 3).join(", ") + (props.selectedTagCategories.length > 3 ? ` +${props.selectedTagCategories.length - 3}` : "")
  }, [copy.common.all, props.selectedTagCategories])

  const filteredTagOptions = useMemo(() => {
    const q = tagSearch.trim().toLowerCase()
    if (!q) return props.tagCategoryOptions
    return props.tagCategoryOptions.filter((x) => String(x || "").toLowerCase().includes(q))
  }, [props.tagCategoryOptions, tagSearch])

  const dealChips = useMemo(() => props.dealTypeOptions, [props.dealTypeOptions])

  const chipsCollapsedCount = 6
  const visibleDealChips = chipsExpanded ? dealChips : dealChips.slice(0, chipsCollapsedCount)
  const hiddenCount = Math.max(0, dealChips.length - visibleDealChips.length)

  return (
    <div className="w-full max-w-[1200px] mx-auto px-3 sm:px-6" data-mm-filters="root">
      <div className="flex flex-col gap-3">
        <div className="sticky top-[52px] sm:top-[72px] z-40 -mx-3 sm:mx-0 px-3 sm:px-0">
          <div className="rounded-2xl border border-white/10 bg-[#0b1220]/75 backdrop-blur-md">
            <div className="p-2.5 sm:p-3">
              <div className="grid grid-cols-12 gap-2 sm:gap-3 items-end min-w-0">
                <div className="col-span-12 lg:col-span-4 min-w-0 w-full">
                  <div className="relative min-w-0 w-full lg:max-w-[360px]">
                    <input
                      value={props.search}
                      onChange={(e) => props.onSearch(e.target.value)}
                      onFocus={closeAll}
                      placeholder={copy.common.searchPlaceholder}
                      className="h-10 w-full min-w-0 rounded-lg bg-white/5 border border-white/10 pl-3 pr-12 text-sm text-white/90 placeholder:text-white/30"
                    />
                    {props.search.trim() ? (
                      <button
                        type="button"
                        onClick={() => props.onSearch("")}
                        className="absolute right-1 top-1 h-10 w-10 grid place-items-center rounded-md text-white/60 hover:text-white/85 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25"
                        aria-label={props.locale === "zh-TW" ? "清除搜尋" : "Clear search"}
                        title={props.locale === "zh-TW" ? "清除搜尋" : "Clear search"}
                        style={{ minHeight: "44px", minWidth: "44px" }}
                      >
                        <span className="text-lg leading-none">×</span>
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className="col-span-12 sm:col-span-6 lg:col-span-2 min-w-0">
                  <div className="text-[11px] text-white/45 mb-1">創作者平台</div>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => {
                        setPlatformOpen((v) => {
                          if (v) return false
                          closeOthers("platform")
                          return true
                        })
                      }}
                      className="h-10 w-full max-w-full rounded-lg bg-white/5 border border-white/10 px-3 text-sm text-white/85 flex items-center justify-between gap-2"
                      aria-expanded={platformOpen}
                    >
                      <span className="min-w-0 truncate">{selectedPlatformLabel}</span>
                      <span className="shrink-0 text-white/50">▾</span>
                    </button>
                    {platformOpen ? (
                      <div className="absolute z-50 mt-2 w-full sm:w-[240px] max-h-[70vh] overflow-auto overscroll-contain rounded-xl border border-white/10 bg-slate-950/90 backdrop-blur-md shadow-xl p-2">
                        <div className="flex items-center justify-between gap-2 px-2 py-1">
                          <div className="text-[11px] text-white/55">創作者平台</div>
                          {props.selectedPlatforms.length ? (
                            <button
                              type="button"
                              onClick={() => props.onClearPlatforms()}
                              className="text-[11px] text-white/60 hover:text-white/80"
                            >
                              {clearLabel}
                            </button>
                          ) : null}
                        </div>
                        <div className="mt-1 space-y-1">
                          {platformOptions.map((o) => {
                            const active = props.selectedPlatforms.includes(o.value)
                            return (
                              <button
                                key={o.value}
                                type="button"
                                onClick={() => props.onTogglePlatform(o.value)}
                                className={`w-full min-h-10 flex items-center justify-between gap-3 rounded-lg px-2 py-2 text-sm text-left transition-colors ${
                                  active ? "bg-emerald-500/10 border border-emerald-400/25 text-white/90" : "hover:bg-white/5 text-white/80 border border-transparent"
                                }`}
                              >
                                <span className="min-w-0 truncate">{o.label}</span>
                                <span className={`shrink-0 text-xs ${active ? "text-emerald-200/90" : "text-white/35"}`}>{active ? "✓" : ""}</span>
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="col-span-12 sm:col-span-6 lg:col-span-2 min-w-0">
                  <div className="text-[11px] text-white/45 mb-1">{mm.creatorTypeLabel}</div>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => {
                        setTagsOpen((v) => {
                          if (v) return false
                          closeOthers("tags")
                          return true
                        })
                      }}
                      className="h-10 w-full max-w-full rounded-lg bg-white/5 border border-white/10 px-3 text-sm text-white/85 flex items-center justify-between gap-2"
                      aria-expanded={tagsOpen}
                    >
                      <span className="min-w-0 truncate">{selectedTagsLabel}</span>
                      <span className="shrink-0 text-white/50">▾</span>
                    </button>

                    {tagsOpen ? (
                      <div className="absolute z-50 mt-2 w-full sm:w-[280px] max-h-[70vh] overflow-auto overscroll-contain rounded-xl border border-white/10 bg-slate-950/90 backdrop-blur-md shadow-xl p-2">
                        <div className="flex items-center justify-between gap-2 px-2 py-1">
                          <div className="text-[11px] text-white/55">{mm.creatorTypeLabel}</div>
                          {props.selectedTagCategories.length ? (
                            <button
                              type="button"
                              onClick={() => props.onClearTagCategories()}
                              className="text-[11px] text-white/60 hover:text-white/80"
                            >
                              {clearLabel}
                            </button>
                          ) : null}
                        </div>

                        <div className="px-2 pt-1">
                          <input
                            value={tagSearch}
                            onChange={(e) => setTagSearch(e.target.value.slice(0, 60))}
                            placeholder={copy.common.searchPlaceholder}
                            className="h-10 w-full rounded-lg bg-white/5 border border-white/10 px-3 text-sm text-white/90 placeholder:text-white/30"
                          />
                        </div>

                        <div className="mt-2 max-h-[280px] overflow-auto overscroll-contain px-1">
                          {filteredTagOptions.map((tag) => {
                            const t = String(tag || "").trim()
                            if (!t) return null
                            const active = props.selectedTagCategories.includes(t)
                            return (
                              <button
                                key={t}
                                type="button"
                                onClick={() => props.onToggleTagCategory(t)}
                                className={`w-full min-h-10 flex items-center justify-between gap-3 rounded-lg px-2 py-2 text-sm text-left transition-colors ${
                                  active ? "bg-sky-500/10 border border-sky-400/25 text-white/90" : "hover:bg-white/5 text-white/80 border border-transparent"
                                }`}
                              >
                                <span className="min-w-0 truncate">{t}</span>
                                <span className={`shrink-0 text-xs ${active ? "text-sky-200/90" : "text-white/35"}`}>{active ? "✓" : ""}</span>
                              </button>
                            )
                          })}
                        </div>

                        <div className="mt-2 border-t border-white/10 pt-2 px-2">
                          <div className="text-[11px] text-white/55">其他</div>
                          <div className="mt-1 flex items-center gap-2">
                            <input
                              value={customTagDraft}
                              onChange={(e) => setCustomTagDraft(e.target.value.slice(0, 30))}
                              placeholder="輸入自訂類型"
                              className="h-10 flex-1 min-w-0 rounded-lg bg-white/5 border border-white/10 px-3 text-sm text-white/90 placeholder:text-white/30"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                const t = String(customTagDraft || "").trim()
                                if (!t) return
                                props.onAddCustomTagCategory(t)
                                setCustomTagDraft("")
                              }}
                              className="h-10 shrink-0 px-3 rounded-lg border border-white/10 bg-white/5 text-sm text-white/80 hover:bg-white/10"
                            >
                              {addLabel}
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>

                <select
                  value={props.budget}
                  onChange={(e) => props.onBudget(e.target.value as any)}
                  onFocus={closeAll}
                  onClick={closeAll}
                  className="h-10 w-full col-span-12 sm:col-span-6 lg:col-span-2 min-w-0 rounded-lg bg-white/5 border border-white/10 px-3 text-sm text-white/90"
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
                  onFocus={closeAll}
                  onClick={closeAll}
                  className="h-10 w-full col-span-12 sm:col-span-6 lg:col-span-2 min-w-0 rounded-lg bg-white/5 border border-white/10 px-3 text-sm text-white/90"
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
                  onClick={() => {
                    closeAll()
                    props.onOpenFavorites()
                  }}
                  className="h-10 w-full col-span-12 lg:col-span-2 px-4 rounded-lg border border-white/10 bg-white/5 text-sm text-white/80 hover:bg-white/10 whitespace-nowrap"
                >
                  {copy.common.favorites} ({props.favoritesCount})
                </button>
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

                {props.selectedPlatforms.length || props.selectedDealTypes.length || props.selectedTagCategories.length ? (
                  <button
                    type="button"
                    onClick={() => {
                      props.onClearPlatforms()
                      props.onClearDealTypes()
                      props.onClearTagCategories()
                    }}
                    className="h-10 px-4 rounded-lg border border-white/10 bg-white/5 text-sm text-white/70 hover:bg-white/10 whitespace-nowrap"
                  >
                    {copy.common.all}
                  </button>
                ) : null}
              </div>

              <div className="mt-2 flex flex-wrap gap-2 min-w-0">
                {visibleDealChips.map((o) => {
                  const active = props.selectedDealTypes.includes(o.value)
                  return (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() => {
                        closeAll()
                        props.onToggleDealType(o.value)
                      }}
                      className={`h-10 px-3 rounded-full border text-sm whitespace-nowrap max-w-full truncate min-w-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/40 ${
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

                {chipsExpanded && dealChips.length > chipsCollapsedCount ? (
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
