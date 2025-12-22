"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useMemo } from "react"
import Logo from "../../../components/Logo"
import LocaleSwitcher from "../../components/locale-switcher"
import { useI18n } from "../../../components/locale-provider"

type NavKey =
  | "kpis"
  | "topPosts"
  | "insights"
  | "goals"
  | "upgrade"

const SECTION_IDS: Record<NavKey, string> = {
  kpis: "kpis-section",
  topPosts: "top-posts-section",
  insights: "insights-section",
  goals: "goals-section",
  upgrade: "upgrade-section",
}

function scrollToId(id: string) {
  const el = document.getElementById(id)
  if (!el) return
  el.scrollIntoView({ behavior: "smooth", block: "start" })
}

function guardedScrollToSectionId(id: string) {
  const el = document.getElementById(id)
  if (!el) return
  el.scrollIntoView({ behavior: "smooth", block: "start" })
}

function NavChip({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="shrink-0 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-white/10 hover:border-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60"
    >
      {label}
    </button>
  )
}

export default function AppHeader({ locale }: { locale: string }) {
  const pathname = usePathname() || ""
  const { t } = useI18n()

  const isResults =
    pathname.includes(`/${locale}/results`) || pathname.endsWith("/results") || pathname.includes("/results?")

  const navItems = useMemo(
    () =>
      [
        { key: "kpis" as const, label: t("results.subnav.items.kpis") },
        { key: "topPosts" as const, label: t("results.subnav.items.topPosts") },
        { key: "insights" as const, label: t("results.subnav.items.insights") },
        { key: "goals" as const, label: t("results.subnav.items.goals") },
        { key: "upgrade" as const, label: t("results.subnav.items.upgrade") },
      ],
    [t]
  )

  return (
    <>
      <header className="sticky top-0 z-50 w-full border-b border-white/10 bg-[#0b1220]/85 backdrop-blur-md">
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-3">
            <Link
              href={`/${locale}`}
              className="inline-flex items-center gap-2 text-sm font-semibold text-white hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 rounded-md"
            >
              <Logo size={28} className="text-white" />
              <span>IG Analyzer</span>
            </Link>

            <div className="flex items-center justify-end">
              <LocaleSwitcher />
            </div>
          </div>
        </div>
      </header>

      {isResults && (
        <div className="w-full border-b border-white/10 bg-[#0b1220]/85 backdrop-blur-md py-1.5 flex items-center">
          <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 h-full">
            <div className="h-full w-full flex items-center">
              <div
                aria-label={t("results.subnav.ariaLabel")}
                className="
    flex gap-3 sm:gap-4 overflow-x-auto whitespace-nowrap pb-1
    [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden
    sm:grid sm:grid-cols-4 sm:gap-4 sm:overflow-visible sm:whitespace-normal
    sm:w-fit sm:mx-auto sm:place-content-center
    lg:grid-cols-7 lg:gap-4
  "
              >
                {navItems.map((it) => (
                  <NavChip
                    key={it.key}
                    label={it.label}
                    onClick={() => {
                      if (it.key === "upgrade") {
                        scrollToId(SECTION_IDS[it.key])
                        return
                      }
                      guardedScrollToSectionId(SECTION_IDS[it.key])
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
