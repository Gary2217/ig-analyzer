"use client"

import { useI18n } from "@/components/locale-provider"

export type CreatorCardValue = {
  handle: string
  displayName: string
  isPublic: boolean
  niche: string
  audience: string
  deliverables: string[]
  contact: string
  portfolio: { title: string; desc: string }[]
}

export default function CreatorCardForm({
  value,
  onChange,
  completion,
  loading,
  saving,
  error,
  saved,
  onSave,
}: {
  value: CreatorCardValue
  onChange: (v: CreatorCardValue) => void
  completion: { pct: number; ready: boolean; done: number; total: number }
  loading: boolean
  saving: boolean
  error: string | null
  saved: boolean
  onSave: () => Promise<void> | void
}) {
  const { t } = useI18n()

  const nicheOptions = ["edu", "beauty", "food", "fitness", "tech", "lifestyle"]
  const audienceOptions = ["tw1834", "tw2539", "global1834", "global2544"]
  const deliverableOptions = ["reels", "post", "story", "unboxing", "affiliate", "livestream"]

  const toggleDeliverable = (key: string) => {
    const has = value.deliverables.includes(key)
    const deliverables = has ? value.deliverables.filter((x) => x !== key) : [...value.deliverables, key]
    onChange({ ...value, deliverables })
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-3 sm:p-4 min-w-0">
      <div className="flex items-start justify-between gap-3 min-w-0">
        <div className="min-w-0">
          <div className="text-[13px] font-semibold text-white leading-snug">{t("creatorCard.form.title")}</div>
          <div className="mt-1 text-[11px] sm:text-[12px] text-white/60 leading-snug">{t("creatorCard.form.subtitle")}</div>
        </div>

        <span className="shrink-0 inline-flex items-center rounded-full border border-white/12 bg-white/5 px-2.5 py-1 text-[10px] font-semibold text-white/80 whitespace-nowrap">
          {completion.ready ? t("creatorCard.form.status.ready") : t("creatorCard.form.status.draft")}
        </span>
      </div>

      {/* Public URL + Display name */}
      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 min-w-0">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold text-white/70">{t("creatorCard.form.handle.label")}</div>
          <input
            value={value.handle}
            onChange={(e) => onChange({ ...value, handle: e.target.value })}
            placeholder={t("creatorCard.form.handle.placeholder")}
            className="mt-1 w-full rounded-xl border border-white/12 bg-white/5 px-3 py-2 text-[12px] text-white/85 placeholder:text-white/35 outline-none focus:border-white/20"
          />
          <div className="mt-1 text-[11px] text-white/55 leading-snug">{t("creatorCard.form.handle.helper")}</div>
        </div>

        <div className="min-w-0">
          <div className="text-[11px] font-semibold text-white/70">{t("creatorCard.form.displayName.label")}</div>
          <input
            value={value.displayName}
            onChange={(e) => onChange({ ...value, displayName: e.target.value })}
            placeholder={t("creatorCard.form.displayName.placeholder")}
            className="mt-1 w-full rounded-xl border border-white/12 bg-white/5 px-3 py-2 text-[12px] text-white/85 placeholder:text-white/35 outline-none focus:border-white/20"
          />
          <div className="mt-1 text-[11px] text-white/55 leading-snug">{t("creatorCard.form.displayName.helper")}</div>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold text-white/75">{t("creatorCard.form.public.label")}</div>
          <div className="mt-0.5 text-[11px] text-white/55 leading-snug">{t("creatorCard.form.public.helper")}</div>
        </div>
        <button
          type="button"
          onClick={() => onChange({ ...value, isPublic: !value.isPublic })}
          className={[
            "shrink-0 inline-flex items-center rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-colors whitespace-nowrap",
            value.isPublic
              ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-200"
              : "border-white/12 bg-white/5 text-white/70 hover:border-white/20 hover:bg-white/7",
          ].join(" ")}
        >
          {value.isPublic ? t("creatorCard.form.public.on") : t("creatorCard.form.public.off")}
        </button>
      </div>

      {/* Niche */}
      <div className="mt-3">
        <div className="text-[11px] font-semibold text-white/70">{t("creatorCard.form.niche.label")}</div>
        <select
          value={value.niche}
          onChange={(e) => onChange({ ...value, niche: e.target.value })}
          className="mt-1 w-full rounded-xl border border-white/12 bg-white/5 px-3 py-2 text-[12px] text-white/85 outline-none focus:border-white/20"
        >
          <option value="">{t("creatorCard.form.niche.placeholder")}</option>
          {nicheOptions.map((k) => (
            <option key={k} value={k}>
              {t(`creatorCard.options.niche.${k}`)}
            </option>
          ))}
        </select>
      </div>

      {/* Audience */}
      <div className="mt-3">
        <div className="text-[11px] font-semibold text-white/70">{t("creatorCard.form.audience.label")}</div>
        <select
          value={value.audience}
          onChange={(e) => onChange({ ...value, audience: e.target.value })}
          className="mt-1 w-full rounded-xl border border-white/12 bg-white/5 px-3 py-2 text-[12px] text-white/85 outline-none focus:border-white/20"
        >
          <option value="">{t("creatorCard.form.audience.placeholder")}</option>
          {audienceOptions.map((k) => (
            <option key={k} value={k}>
              {t(`creatorCard.options.audience.${k}`)}
            </option>
          ))}
        </select>
      </div>

      {/* Deliverables chips */}
      <div className="mt-3">
        <div className="text-[11px] font-semibold text-white/70">{t("creatorCard.form.deliverables.label")}</div>
        <div className="mt-2 flex flex-wrap gap-2">
          {deliverableOptions.map((k) => {
            const active = value.deliverables.includes(k)
            return (
              <button
                key={k}
                type="button"
                onClick={() => toggleDeliverable(k)}
                className={[
                  "inline-flex items-center rounded-full px-3 py-1.5 text-[11px] border transition-colors",
                  active
                    ? "border-white/20 bg-white/10 text-white"
                    : "border-white/10 bg-white/5 text-white/75 hover:border-white/16 hover:bg-white/7",
                ].join(" ")}
              >
                {t(`creatorCard.options.deliverables.${k}`)}
              </button>
            )
          })}
        </div>
        <div className="mt-1 text-[11px] text-white/55 leading-snug">{t("creatorCard.form.deliverables.helper")}</div>
      </div>

      {/* Contact */}
      <div className="mt-3">
        <div className="text-[11px] font-semibold text-white/70">{t("creatorCard.form.contact.label")}</div>
        <input
          value={value.contact}
          onChange={(e) => onChange({ ...value, contact: e.target.value })}
          placeholder={t("creatorCard.form.contact.placeholder")}
          className="mt-1 w-full rounded-xl border border-white/12 bg-white/5 px-3 py-2 text-[12px] text-white/85 placeholder:text-white/35 outline-none focus:border-white/20"
        />
      </div>

      {/* Portfolio (3) */}
      <div className="mt-4">
        <div className="text-[11px] font-semibold text-white/70">{t("creatorCard.form.portfolio.label")}</div>
        <div className="mt-2 space-y-2">
          {value.portfolio.map((p, idx) => (
            <div key={idx} className="rounded-xl border border-white/10 bg-white/5 p-3 min-w-0">
              <div className="text-[10px] font-semibold text-white/55">
                {t("creatorCard.form.portfolio.itemLabel")} {idx + 1}
              </div>
              <input
                value={p.title}
                onChange={(e) => {
                  const portfolio = value.portfolio.slice()
                  portfolio[idx] = { ...portfolio[idx], title: e.target.value }
                  onChange({ ...value, portfolio })
                }}
                placeholder={t("creatorCard.form.portfolio.titlePlaceholder")}
                className="mt-1 w-full rounded-lg border border-white/12 bg-white/5 px-3 py-2 text-[12px] text-white/85 placeholder:text-white/35 outline-none focus:border-white/20"
              />
              <textarea
                value={p.desc}
                onChange={(e) => {
                  const portfolio = value.portfolio.slice()
                  portfolio[idx] = { ...portfolio[idx], desc: e.target.value }
                  onChange({ ...value, portfolio })
                }}
                placeholder={t("creatorCard.form.portfolio.descPlaceholder")}
                className="mt-2 w-full min-h-[64px] resize-none rounded-lg border border-white/12 bg-white/5 px-3 py-2 text-[12px] text-white/85 placeholder:text-white/35 outline-none focus:border-white/20"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="mt-4 flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
        <div className="text-[11px] text-white/55 leading-snug">
          {loading ? t("creatorCard.db.loading") : t("creatorCard.form.saveHint")}
          {saved ? <span className="ml-2 text-emerald-200/80">{t("creatorCard.db.saved")}</span> : null}
          {error ? (
            <span className="ml-2 text-rose-200/80">
              {t("creatorCard.db.error")}: {error}
            </span>
          ) : null}
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onSave}
            disabled={loading || saving}
            className={[
              "inline-flex items-center justify-center rounded-xl border px-3 py-2 text-[12px] font-semibold transition-colors",
              loading || saving
                ? "border-white/10 bg-white/3 text-white/40 cursor-not-allowed"
                : "border-white/12 bg-white/5 text-white/85 hover:border-white/20 hover:bg-white/7",
            ].join(" ")}
            title={saving ? t("creatorCard.db.saving") : undefined}
          >
            {saving ? t("creatorCard.db.saving") : t("creatorCard.form.save")}
          </button>

          <button
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            className="inline-flex items-center justify-center rounded-xl border border-white/12 bg-white/5 px-3 py-2 text-[12px] font-semibold text-white/80 hover:border-white/20 hover:bg-white/7 transition-colors"
          >
            {t("creatorCard.form.toPreview")}
          </button>
        </div>
      </div>
    </div>
  )
}
