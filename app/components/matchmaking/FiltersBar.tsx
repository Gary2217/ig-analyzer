"use client"

import { useMemo } from "react"
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

  type: TypeKey | "any"
  onType: (v: TypeKey | "any") => void
  typeOptions: Array<{ value: TypeKey | "any"; label: string }>

  sort: "followers_desc" | "er_desc"
  onSort: (v: "followers_desc" | "er_desc") => void

  total: number
}

export function FiltersBar(props: Props) {
  const copy = getCopy(props.locale)
  const mm = copy.matchmaking

  const budgetOptions: Array<{ value: BudgetRange; label: string }> = useMemo(
    () => [
      { value: "any", label: mm.budgetLabel },
      { value: "custom", label: mm.budgetOtherAmount },
      { value: "0_5000", label: "≤ 5,000" },
      { value: "5000_10000", label: "5,000–10,000" },
      { value: "10000_30000", label: "10,000–30,000" },
      { value: "30000_60000", label: "30,000–60,000" },
      { value: "60000_plus", label: "60,000+" },
    ],
    [mm]
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

        <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
          <input
            value={props.search}
            onChange={(e) => props.onSearch(e.target.value)}
            placeholder={copy.common.searchPlaceholder}
            className="col-span-2 lg:col-span-2 h-11 rounded-lg bg-white/5 border border-white/10 px-3 text-sm text-white/90 placeholder:text-white/30 min-w-0"
          />

          <select
            value={props.platform}
            onChange={(e) => props.onPlatform(e.target.value as any)}
            className="h-11 rounded-lg bg-white/5 border border-white/10 px-3 text-sm text-white/90 min-w-0"
          >
            {props.platformOptions.map((o) => (
              <option key={o.value} value={o.value} className="bg-slate-900">
                {o.label}
              </option>
            ))}
          </select>

          <select
            value={props.type}
            onChange={(e) => props.onType(e.target.value as any)}
            className="h-11 rounded-lg bg-white/5 border border-white/10 px-3 text-sm text-white/90 min-w-0"
          >
            {props.typeOptions.map((o) => (
              <option key={o.value} value={o.value} className="bg-slate-900">
                {o.label}
              </option>
            ))}
          </select>

          <select
            value={props.budget}
            onChange={(e) => props.onBudget(e.target.value as any)}
            className="h-11 rounded-lg bg-white/5 border border-white/10 px-3 text-sm text-white/90 min-w-0"
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
            className="h-11 rounded-lg bg-white/5 border border-white/10 px-3 text-sm text-white/90 min-w-0"
          >
            <option value="followers_desc" className="bg-slate-900">
              {mm.sortFollowersDesc}
            </option>
            <option value="er_desc" className="bg-slate-900">
              {mm.sortErDesc}
            </option>
          </select>
        </div>

        {props.budget === "custom" ? (
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
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
  )
}
