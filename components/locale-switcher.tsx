"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { Check, Globe } from "lucide-react"
import type { Locale } from "../lib/i18n"
import { useI18n } from "./locale-provider"

const LOCALES: Locale[] = ["zh-TW", "en"]

function setLocaleCookie(locale: Locale) {
  document.cookie = `locale=${locale}; path=/; max-age=${60 * 60 * 24 * 365}`
}

export default function LocaleSwitcher() {
  const { t } = useI18n()
  const router = useRouter()
  const pathname = usePathname() || "/"
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  const parts = pathname.split("/").filter(Boolean)
  const current = (parts[0] === "zh-TW" || parts[0] === "en" ? parts[0] : "en") as Locale
  const rest = parts[0] === "zh-TW" || parts[0] === "en" ? parts.slice(1) : parts
  const restPath = rest.length ? `/${rest.join("/")}` : ""

  const labels = useMemo<Record<Locale, string>>(
    () => ({
      "zh-TW": t("language.zhTW"),
      en: t("language.en"),
    }),
    [t]
  )

  const switchTo = (next: Locale) => {
    if (next === current) return
    setLocaleCookie(next)
    setOpen(false)
    router.push(`/${next}${restPath || "/"}`)
  }

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      const el = rootRef.current
      if (!el) return
      if (e.target instanceof Node && !el.contains(e.target)) setOpen(false)
    }
    window.addEventListener("pointerdown", onPointerDown)
    return () => window.removeEventListener("pointerdown", onPointerDown)
  }, [])

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center justify-center h-8 w-8 rounded-md border border-white/10 text-slate-200 hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60"
      >
        <Globe className="h-4 w-4" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-40 rounded-xl border border-white/10 bg-[#0b1220]/90 backdrop-blur-md shadow-xl overflow-hidden z-50"
        >
          {LOCALES.map((l) => (
            <button
              key={l}
              role="menuitem"
              type="button"
              onClick={() => switchTo(l)}
              className={
                l === current
                  ? "w-full flex items-center justify-between gap-2 px-3 py-2 text-sm text-white bg-white/5"
                  : "w-full flex items-center justify-between gap-2 px-3 py-2 text-sm text-slate-200 hover:bg-white/5"
              }
            >
              <span className="truncate">{labels[l]}</span>
              {l === current ? <Check className="h-4 w-4 text-blue-200" /> : <span className="h-4 w-4" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
