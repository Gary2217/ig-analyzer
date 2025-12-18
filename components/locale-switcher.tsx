"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Globe } from "lucide-react"
import type { Locale } from "../lib/i18n"

const LOCALES: Locale[] = ["zh-TW", "en"]

function setLocaleCookie(locale: Locale) {
  document.cookie = `locale=${locale}; path=/; max-age=${60 * 60 * 24 * 365}`
}

export default function LocaleSwitcher() {
  const router = useRouter()
  const pathname = usePathname() || "/"
  const searchParams = useSearchParams()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  const current = ((pathname.match(/^\/(en|zh-TW)(?=\/|$)/)?.[1] ?? "en") as Locale)
  const restPath = pathname.replace(/^\/(en|zh-TW)(?=\/|$)/, "")

  const search = useMemo(() => {
    const qs = searchParams?.toString() || ""
    return qs ? `?${qs}` : ""
  }, [searchParams])

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      const el = rootRef.current
      if (!el) return
      if (el.contains(e.target as Node)) return
      setOpen(false)
    }
    window.addEventListener("pointerdown", onPointerDown)
    return () => window.removeEventListener("pointerdown", onPointerDown)
  }, [])

  const switchTo = (next: Locale) => {
    if (next === current) return
    setLocaleCookie(next)
    const nextPath = `/${next}${restPath || ""}${search}`
    router.replace(nextPath)
    setOpen(false)
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center justify-center rounded-full border border-white/15 text-slate-200 hover:bg-white/5 w-10 h-10"
      >
        <Globe className="h-5 w-5" />
        <span className="sr-only">Switch language</span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 min-w-[160px] rounded-xl border border-white/10 bg-[#0b1220]/95 backdrop-blur-md shadow-xl p-1 z-[80]"
        >
          {LOCALES.map((l) => {
            const active = l === current
            return (
              <button
                key={l}
                type="button"
                role="menuitem"
                onClick={() => switchTo(l)}
                className={
                  active
                    ? "w-full flex items-center justify-between gap-2 px-3 py-2 text-sm rounded-lg bg-white/5 text-white"
                    : "w-full flex items-center justify-between gap-2 px-3 py-2 text-sm rounded-lg text-slate-200 hover:bg-white/5"
                }
              >
                <span>{l === "zh-TW" ? "繁體中文" : "English"}</span>
                {active ? <span className="text-xs text-slate-400">✓</span> : null}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
