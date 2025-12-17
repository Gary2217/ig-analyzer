"use client"

import { usePathname, useRouter } from "next/navigation"
import type { Locale } from "../lib/i18n"

const LOCALES: Locale[] = ["zh-TW", "en"]

function setLocaleCookie(locale: Locale) {
  document.cookie = `locale=${locale}; path=/; max-age=${60 * 60 * 24 * 365}`
}

export default function LocaleSwitcher() {
  const router = useRouter()
  const pathname = usePathname() || "/"

  const parts = pathname.split("/").filter(Boolean)
  const current = (parts[0] === "zh-TW" || parts[0] === "en" ? parts[0] : "en") as Locale
  const rest = parts[0] === "zh-TW" || parts[0] === "en" ? parts.slice(1) : parts
  const restPath = rest.length ? `/${rest.join("/")}` : ""

  const switchTo = (next: Locale) => {
    if (next === current) return
    setLocaleCookie(next)
    router.push(`/${next}${restPath || "/"}`)
  }

  return (
    <div className="flex items-center gap-2">
      {LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => switchTo(l)}
          className={
            l === current
              ? "px-3 py-1 rounded-md text-xs border border-white/20 bg-white/10 text-white"
              : "px-3 py-1 rounded-md text-xs border border-white/10 text-slate-200 hover:bg-white/5"
          }
        >
          {l === "zh-TW" ? "繁體中文" : "English"}
        </button>
      ))}
    </div>
  )
}
