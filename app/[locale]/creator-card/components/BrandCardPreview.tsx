"use client"

import { useI18n } from "@/components/locale-provider"
import type { CreatorCardValue } from "./CreatorCardForm"

function textOr(value: string, fallback: string) {
  return value.trim().length > 0 ? value : fallback
}

export default function BrandCardPreview({
  value,
  completion,
}: {
  value: CreatorCardValue
  completion: { pct: number; ready: boolean; done: number; total: number }
}) {
  const { t } = useI18n()

  const nicheValue = value.niche ? t(`creatorCard.options.niche.${value.niche}`) : t("creatorCard.preview.placeholders.niche")
  const audienceValue = value.audience
    ? t(`creatorCard.options.audience.${value.audience}`)
    : t("creatorCard.preview.placeholders.audience")

  const deliverablesValue =
    value.deliverables.length > 0
      ? value.deliverables.map((k) => t(`creatorCard.options.deliverables.${k}`)).join(" / ")
      : t("creatorCard.preview.placeholders.deliverables")

  const contactValue = textOr(value.contact, t("creatorCard.preview.placeholders.contact"))

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-3 sm:p-4 min-w-0">
      <div className="flex items-start justify-between gap-3 min-w-0">
        <div className="min-w-0">
          <div className="text-[13px] font-semibold text-white leading-snug">{t("creatorCard.preview.title")}</div>
          <div className="mt-1 text-[11px] sm:text-[12px] text-white/60 leading-snug line-clamp-2">
            {t("creatorCard.preview.subtitle")}
          </div>
        </div>

        <span className="shrink-0 inline-flex items-center rounded-full border border-white/12 bg-white/5 px-2.5 py-1 text-[10px] font-semibold text-white/80 whitespace-nowrap">
          {completion.ready ? t("creatorCard.preview.badgeReady") : t("creatorCard.preview.badgeDraft")}
        </span>
      </div>

      {/* Snapshot rows */}
      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 min-w-0">
        <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 min-w-0">
          <div className="text-[10px] font-semibold text-white/60">{t("creatorCard.preview.rows.nicheLabel")}</div>
          <div className="mt-0.5 text-[12px] font-semibold text-white truncate">{nicheValue}</div>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 min-w-0">
          <div className="text-[10px] font-semibold text-white/60">{t("creatorCard.preview.rows.audienceLabel")}</div>
          <div className="mt-0.5 text-[12px] font-semibold text-white truncate">{audienceValue}</div>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 min-w-0">
          <div className="text-[10px] font-semibold text-white/60">{t("creatorCard.preview.rows.deliverablesLabel")}</div>
          <div className="mt-0.5 text-[12px] font-semibold text-white truncate">{deliverablesValue}</div>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 min-w-0">
          <div className="text-[10px] font-semibold text-white/60">{t("creatorCard.preview.rows.contactLabel")}</div>
          <div className="mt-0.5 text-[12px] font-semibold text-white truncate">{contactValue}</div>
        </div>
      </div>

      {/* Deliverables chips */}
      <div className="mt-3">
        <div className="text-[10px] font-semibold text-white/60">{t("creatorCard.preview.chipsLabel")}</div>
        <div className="mt-2 flex flex-wrap gap-2">
          {(value.deliverables.length > 0 ? value.deliverables : ["reels", "post", "unboxing"]).slice(0, 4).map((k) => (
            <span
              key={k}
              className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] text-white/75"
            >
              {t(`creatorCard.options.deliverables.${k}`)}
            </span>
          ))}
        </div>
      </div>

      {/* Portfolio preview */}
      <div className="mt-3">
        <div className="text-[10px] font-semibold text-white/60">{t("creatorCard.preview.portfolioLabel")}</div>
        <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2 min-w-0">
          {value.portfolio.slice(0, 3).map((p, idx) => {
            const title = textOr(p.title, `${t("creatorCard.preview.portfolio.item")} #${idx + 1}`)
            const desc = textOr(p.desc, t("creatorCard.preview.portfolio.placeholderDesc"))
            return (
              <div key={idx} className="rounded-xl border border-white/10 bg-white/5 p-3 min-w-0">
                <div className="text-[11px] font-semibold text-white truncate">{title}</div>
                <div className="mt-1 text-[10px] text-white/55 leading-snug line-clamp-2">{desc}</div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Brand actions (UI-only) */}
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
        <button
          type="button"
          disabled
          className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/3 px-3 py-2 text-[12px] font-semibold text-white/40 cursor-not-allowed"
          title={t("creatorCard.preview.cta.comingSoon")}
        >
          {t("creatorCard.preview.cta.primary")}
        </button>

        <button
          type="button"
          onClick={() => document.querySelector("textarea, input, select")?.scrollIntoView({ behavior: "smooth", block: "center" })}
          className="inline-flex items-center justify-center rounded-xl border border-white/12 bg-white/5 px-3 py-2 text-[12px] font-semibold text-white/80 hover:border-white/20 hover:bg-white/7 transition-colors"
        >
          {t("creatorCard.preview.cta.secondary")}
        </button>
      </div>

      <div className="mt-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[11px] text-white/65 leading-snug">
        {t("creatorCard.preview.cta.note")}
      </div>
    </div>
  )
}
