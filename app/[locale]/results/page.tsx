"use client"

import ResultsPage from "../../results/page"
import { useI18n } from "../../../components/locale-provider"
import { Button } from "../../../components/ui/button"

export default function LocaleResultsPage() {
  const { t } = useI18n()

  return (
    <div className="bg-[#0b1220]">
      <ResultsPage />

      <section id="upgrade-section" className="scroll-mt-32">
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 pb-16">
          <div className="mt-10 rounded-2xl border border-white/10 bg-gradient-to-b from-white/8 via-white/4 to-white/2 backdrop-blur-sm shadow-xl shadow-black/40">
            <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_0.8fr] gap-6 p-5 sm:p-6">
              <div className="min-w-0">
                <div className="text-xs font-medium text-slate-400">{t("results.upgrade.kicker")}</div>
                <h2 className="mt-1 text-xl sm:text-2xl font-semibold text-white">
                  {t("results.upgrade.title")}
                </h2>
                <p className="mt-2 text-sm text-slate-300 max-w-2xl">{t("results.upgrade.subtitle")}</p>

                <ul className="mt-4 space-y-2 text-sm text-slate-200">
                  <li className="flex items-start gap-2">
                    <span className="mt-1 h-1.5 w-1.5 rounded-full bg-emerald-400/90" />
                    <span>{t("results.upgrade.benefits.1")}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-1 h-1.5 w-1.5 rounded-full bg-emerald-400/90" />
                    <span>{t("results.upgrade.benefits.2")}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-1 h-1.5 w-1.5 rounded-full bg-emerald-400/90" />
                    <span>{t("results.upgrade.benefits.3")}</span>
                  </li>
                </ul>
              </div>

              <div className="flex flex-col justify-between gap-4">
                <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <div className="hidden lg:flex shrink-0 w-[420px] max-w-full">
                    <div className="w-full rounded-xl border border-white/10 bg-white/5 p-4">
                      <button
                        type="button"
                        className="w-full rounded-xl bg-gradient-to-r from-fuchsia-500 via-violet-500 to-indigo-500 hover:from-fuchsia-400 hover:via-violet-400 hover:to-indigo-400 px-4 py-4 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60"
                        onClick={() => console.log("open_full_analysis_top")}
                      >
                        <div className="flex flex-col items-center justify-center">
                          <div className="text-base font-semibold leading-tight">
                            {t("results.profileUpgrade.button")}
                          </div>
                          <div className="mt-1 text-xs font-medium opacity-90 leading-relaxed">
                            {t("results.actions.viewFullAnalysis")}
                          </div>
                        </div>
                      </button>
                    </div>
                  </div>

                  {/* Mobile: show the same CTA below on small screens */}
                  <div className="lg:hidden mt-4">
                    <div className="w-full rounded-xl border border-white/10 bg-white/5 p-4">
                      <button
                        type="button"
                        className="w-full rounded-xl bg-gradient-to-r from-fuchsia-500 via-violet-500 to-indigo-500 hover:from-fuchsia-400 hover:via-violet-400 hover:to-indigo-400 px-4 py-4 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60"
                        onClick={() => console.log("open_full_analysis_top_mobile")}
                      >
                        <div className="flex flex-col items-center justify-center">
                          <div className="text-base font-semibold leading-tight">
                            {t("results.profileUpgrade.button")}
                          </div>
                          <div className="mt-1 text-xs font-medium opacity-90 leading-relaxed">
                            {t("results.actions.viewFullAnalysis")}
                          </div>
                        </div>
                      </button>
                    </div>
                  </div>
                  <div className="mt-3 text-xs text-slate-400">{t("results.upgrade.trust")}</div>
                </div>

                <div className="text-xs text-slate-500">{t("results.upgrade.uiOnly")}</div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
