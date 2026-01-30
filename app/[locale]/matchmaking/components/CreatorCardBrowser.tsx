"use client"

import { useMemo, useState } from "react"
import { CreatorCardList } from "./CreatorCardList"
import type { CreatorCard } from "../types"

interface CreatorCardBrowserProps {
  cards: CreatorCard[]
  locale: "zh-TW" | "en"
}

export function CreatorCardBrowser({
  cards,
  locale,
}: CreatorCardBrowserProps) {
  const [q, setQ] = useState("")
  const [niche, setNiche] = useState("all")
  const [sort, setSort] = useState<"recent" | "name">("recent")

  const copy = locale === "zh-TW"
    ? {
        searchPlaceholder: "搜尋創作者（例如：gary）",
        allCategories: "全部分類",
        sortRecent: "最新更新",
        sortName: "名稱 A-Z",
        totalLabel: "共",
        creatorsLabel: "位",
      }
    : {
        searchPlaceholder: "Search creators (e.g., gary)",
        allCategories: "All Categories",
        sortRecent: "Recently Updated",
        sortName: "Name A-Z",
        totalLabel: "Total",
        creatorsLabel: "creators",
      }

  const niches = useMemo(() => {
    const set = new Set<string>()
    cards.forEach((c) => set.add((c.category || "Creator").trim()))
    return ["all", ...Array.from(set).filter(Boolean).sort()]
  }, [cards])

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase()

    let out = cards.filter((c) => {
      const nameOk = !qq || (c.displayName || "").toLowerCase().includes(qq)
      const nicheOk = niche === "all" || (c.category || "Creator") === niche
      return nameOk && nicheOk
    })

    if (sort === "name") {
      out = [...out].sort((a, b) => (a.displayName || "").localeCompare(b.displayName || ""))
    } else {
      // recent: assume server already sorts by updated_at; keep stable
      out = [...out]
    }

    return out
  }, [cards, q, niche, sort])

  return (
    <div className="mt-6">
      <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={copy.searchPlaceholder}
            className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/20"
          />

          <select
            value={niche}
            onChange={(e) => setNiche(e.target.value)}
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/20"
          >
            <option value="all">{copy.allCategories}</option>
            {niches.filter((x) => x !== "all").map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>

          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as "recent" | "name")}
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/20"
          >
            <option value="recent">{copy.sortRecent}</option>
            <option value="name">{copy.sortName}</option>
          </select>
        </div>

        <div className="text-sm text-white/70 whitespace-nowrap">
          {copy.totalLabel} <span className="text-white">{filtered.length}</span> {copy.creatorsLabel}
        </div>
      </div>

      <div className="mt-6">
        <CreatorCardList cards={filtered} locale={locale} />
      </div>
    </div>
  )
}
