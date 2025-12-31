"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import ResultsPage from "../../results/page"
import { useI18n } from "../../../components/locale-provider"

export default function LocaleResultsPage() {
  const pathname = usePathname() || ""
  const locale = pathname.split("/")[1] || "en"
  const { t } = useI18n()

  return (
    <div className="bg-[#0b1220]">
      <ResultsPage />

      <section id="upgrade-section" className="scroll-mt-32">
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 pb-10 sm:pb-14">
          <div className="mt-3 sm:mt-6 lg:mt-10 rounded-2xl border border-white/10 bg-gradient-to-b from-white/8 via-white/4 to-white/2 backdrop-blur-sm shadow-xl shadow-black/40">
            <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_0.8fr] gap-3 lg:gap-6 p-3 sm:p-6">
              <div className="min-w-0">
                <div className="text-[11px] sm:text-xs font-medium text-slate-400">{t("results.upgrade.kicker")}</div>
                <h2 className="mt-1 text-lg sm:text-2xl font-semibold text-white">
                  {t("results.upgrade.title")}
                </h2>
                <p className="mt-2 text-[13px] sm:text-sm text-slate-300 max-w-2xl line-clamp-2 sm:line-clamp-none">{t("results.upgrade.subtitle")}</p>

                <ul className="mt-2 space-y-1 text-[13px] sm:text-sm text-slate-200">
                  <li className="flex items-start gap-2">
                    <span className="mt-1 h-1.5 w-1.5 rounded-full bg-emerald-400/90" />
                    <span className="line-clamp-1 sm:line-clamp-none">{t("results.upgrade.benefits.1")}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-1 h-1.5 w-1.5 rounded-full bg-emerald-400/90" />
                    <span className="line-clamp-1 sm:line-clamp-none">{t("results.upgrade.benefits.2")}</span>
                  </li>
                  <li className="hidden lg:flex items-start gap-2">
                    <span className="mt-1 h-1.5 w-1.5 rounded-full bg-emerald-400/90" />
                    <span className="line-clamp-1 sm:line-clamp-none">{t("results.upgrade.benefits.3")}</span>
                  </li>
                </ul>
              </div>

              <div className="flex flex-col justify-between gap-4">
                <div className="rounded-xl border border-white/10 bg-white/5 p-2.5 sm:p-4">
                  <Link
                    href={`/${locale}/pricing`}
                    className="w-full rounded-xl bg-gradient-to-r from-fuchsia-500 via-violet-500 to-indigo-500 hover:from-fuchsia-400 hover:via-violet-400 hover:to-indigo-400 px-4 py-3 sm:py-5 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 inline-flex"
                  >
                    <div className="flex flex-col items-center justify-center">
                      <div className="text-base font-semibold leading-tight">
                        {t("results.profileUpgrade.button")}
                      </div>
                      <div className="mt-0.5 text-xs font-medium opacity-90 leading-relaxed">
                        {t("results.actions.viewFullAnalysis")}
                      </div>
                    </div>
                  </Link>
                  <div className="hidden lg:block mt-2 text-xs text-slate-400">{t("results.upgrade.trust")}</div>
                </div>

                <div className="hidden lg:block text-xs text-slate-500">{t("results.upgrade.uiOnly")}</div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
