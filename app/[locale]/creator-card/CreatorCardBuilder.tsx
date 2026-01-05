"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useI18n } from "@/components/locale-provider"
import CreatorCardForm, { CreatorCardValue } from "./components/CreatorCardForm"
import BrandCardPreview from "./components/BrandCardPreview"

const DEFAULT_VALUE: CreatorCardValue = {
  handle: "",
  displayName: "",
  isPublic: false,
  niche: "",
  audience: "",
  deliverables: [],
  contact: "",
  portfolio: [
    { title: "", desc: "" },
    { title: "", desc: "" },
    { title: "", desc: "" },
  ],
}

export default function CreatorCardBuilder() {
  const { t } = useI18n()

  const [value, setValue] = useState<CreatorCardValue>(DEFAULT_VALUE)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        setLoading(true)
        setError(null)
        const res = await fetch("/api/creator-card/me", { cache: "no-store" })
        if (!res.ok) {
          const j = await res.json().catch(() => null)
          if (!cancelled) setError(j?.error || "load_failed")
          return
        }
        const j = await res.json().catch(() => null)
        const card = j?.card
        if (card && !cancelled) {
          setValue((prev) => ({
            ...prev,
            handle: card.handle || "",
            displayName: card.display_name || "",
            isPublic: !!card.is_public,
            niche: card.niche || "",
            audience: card.audience || "",
            deliverables: Array.isArray(card.deliverables) ? card.deliverables : [],
            contact: card.contact || "",
            portfolio: Array.isArray(card.portfolio) && card.portfolio.length ? card.portfolio : prev.portfolio,
          }))
        }
      } catch {
        if (!cancelled) setError("load_failed")
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  // UI-only completion: 7 checkpoints
  const completion = useMemo(() => {
    const checks = [
      value.niche.trim().length > 0,
      value.audience.trim().length > 0,
      value.deliverables.length > 0,
      value.contact.trim().length > 0,
      value.portfolio[0]?.title.trim().length > 0 || value.portfolio[0]?.desc.trim().length > 0,
      value.portfolio[1]?.title.trim().length > 0 || value.portfolio[1]?.desc.trim().length > 0,
      value.portfolio[2]?.title.trim().length > 0 || value.portfolio[2]?.desc.trim().length > 0,
    ]
    const done = checks.reduce((a, b) => a + (b ? 1 : 0), 0)
    const total = checks.length
    const pct = Math.round((done / total) * 100)
    return { done, total, pct, ready: pct >= 70 }
  }, [value])

  return (
    <div className="mx-auto w-full max-w-6xl px-3 sm:px-4 lg:px-6 py-4 sm:py-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between min-w-0">
        <div className="min-w-0">
          <div className="text-white font-semibold tracking-tight text-[15px] sm:text-[16px] leading-snug">
            {t("creatorCard.page.title")}
          </div>
          <div className="mt-1 text-[12px] sm:text-[13px] text-white/60 leading-snug">
            {t("creatorCard.page.subtitle")}
          </div>
          {error ? (
            <div className="mt-1 text-[11px] text-rose-200/80">
              {t("creatorCard.db.error")}: {error}
            </div>
          ) : null}
          {saved ? <div className="mt-1 text-[11px] text-emerald-200/80">{t("creatorCard.db.saved")}</div> : null}
        </div>

        <div className="flex items-center gap-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/5 px-3 py-1.5 text-[11px] font-semibold text-white/80 whitespace-nowrap">
            <span className="text-white/70">{t("creatorCard.page.completion")}</span>
            <span className="tabular-nums">{completion.pct}%</span>
            <span className="text-white/55">({completion.done}/{completion.total})</span>
            {completion.ready ? (
              <span className="ml-1 inline-flex items-center rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-200">
                {t("creatorCard.page.ready")}
              </span>
            ) : (
              <span className="ml-1 inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-white/60">
                {t("creatorCard.page.draft")}
              </span>
            )}
          </div>

          <Link
            href="../results"
            className="inline-flex items-center justify-center rounded-xl border border-white/12 bg-white/5 px-3 py-2 text-[12px] font-semibold text-white/80 hover:border-white/20 hover:bg-white/7 transition-colors"
          >
            {t("creatorCard.page.backToResults")}
          </Link>
        </div>
      </div>

      {/* Builder layout */}
      <div className="mt-4 grid grid-cols-1 lg:grid-cols-12 gap-3 lg:gap-4 min-w-0">
        {/* Preview FIRST on mobile; RIGHT on desktop */}
        <div className="lg:col-span-7 lg:order-2 min-w-0">
          <BrandCardPreview value={value} completion={completion} />
        </div>

        {/* Form SECOND on mobile; LEFT on desktop */}
        <div className="lg:col-span-5 lg:order-1 min-w-0">
          <CreatorCardForm
            value={value}
            onChange={(v) => {
              setSaved(false)
              setValue(v)
            }}
            completion={completion}
            loading={loading}
            saving={saving}
            error={error}
            saved={saved}
            onSave={async () => {
              try {
                setSaving(true)
                setError(null)
                setSaved(false)
                const res = await fetch("/api/creator-card/upsert", {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify(value),
                })
                const j = await res.json().catch(() => null)
                if (!res.ok) {
                  setError(j?.error || "save_failed")
                  return
                }
                if (j?.card?.handle) {
                  setValue((prev) => ({ ...prev, handle: j.card.handle }))
                }
                setSaved(true)
              } catch {
                setError("save_failed")
              } finally {
                setSaving(false)
              }
            }}
          />
        </div>
      </div>

      {/* Bottom note */}
      <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5 sm:px-4 text-[11px] sm:text-[12px] text-white/65 leading-snug">
        {t("creatorCard.page.note")}
      </div>
    </div>
  )
}
