"use client"

import { useMemo, type ReactNode } from "react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export type CreatorCardPreviewHighlightTarget = "formats" | "niches" | "brands" | null

export type CreatorCardPreviewProps = {
  t: (key: string) => string
  className?: string
  id?: string
  headerClassName?: string
  actions?: ReactNode

  profileImageUrl?: string | null
  displayName?: string | null
  username?: string | null

  aboutText?: string | null
  primaryNiche?: string | null

  collaborationNiches?: string[] | null
  deliverables?: string[] | null
  pastCollaborations?: string[] | null

  followersText?: string | null
  avgLikesLabel?: string | null
  avgLikesText?: string | null
  avgCommentsLabel?: string | null
  avgCommentsText?: string | null
  engagementRateText?: string | null
  reachText?: string | null

  highlightTarget?: CreatorCardPreviewHighlightTarget
}

function normalizeStringArray(value: unknown, maxLen: number) {
  const raw = Array.isArray(value) ? value : []
  const out: string[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    if (typeof item !== "string") continue
    const s = item.trim()
    if (!s) continue
    const k = s.toLowerCase()
    if (seen.has(k)) continue
    seen.add(k)
    out.push(s)
    if (out.length >= maxLen) break
  }
  return out
}

export function CreatorCardPreview(props: CreatorCardPreviewProps) {
  const {
    t,
    id,
    className,
    headerClassName,
    actions,
    profileImageUrl,
    displayName,
    username,
    aboutText,
    primaryNiche,
    collaborationNiches,
    deliverables,
    pastCollaborations,
    followersText,
    avgLikesLabel,
    avgLikesText,
    avgCommentsLabel,
    avgCommentsText,
    engagementRateText,
    reachText,
    highlightTarget,
  } = props

  const resolvedAboutText = typeof aboutText === "string" && aboutText.trim() ? aboutText.trim() : t("results.mediaKit.about.placeholder")
  const resolvedPrimaryNiche =
    typeof primaryNiche === "string" && primaryNiche.trim() ? primaryNiche.trim() : t("results.mediaKit.common.noData")

  const resolvedDisplayName = typeof displayName === "string" && displayName.trim() ? displayName.trim() : "—"
  const resolvedUsername = typeof username === "string" && username.trim() ? username.trim() : "—"

  const nicheText = useMemo(() => {
    const ids = normalizeStringArray(collaborationNiches ?? [], 20)
    if (ids.length === 0) return t("results.mediaKit.collaborationNiches.empty")

    const labelMap: Record<string, string> = {
      beauty: t("creatorCardEditor.niches.options.beauty"),
      fashion: t("creatorCardEditor.niches.options.fashion"),
      food: t("creatorCardEditor.niches.options.food"),
      travel: t("creatorCardEditor.niches.options.travel"),
      parenting: t("creatorCardEditor.niches.options.parenting"),
      fitness: t("creatorCardEditor.niches.options.fitness"),
      tech: t("creatorCardEditor.niches.options.tech"),
      finance: t("creatorCardEditor.niches.options.finance"),
      education: t("creatorCardEditor.niches.options.education"),
      gaming: t("creatorCardEditor.niches.options.gaming"),
      lifestyle: t("creatorCardEditor.niches.options.lifestyle"),
      pets: t("creatorCardEditor.niches.options.pets"),
      home: t("creatorCardEditor.niches.options.home"),
      ecommerce: t("creatorCardEditor.niches.options.ecommerce"),
    }

    return ids.map((id) => labelMap[id] || id).join(" · ")
  }, [collaborationNiches, t])

  const formats = useMemo(() => normalizeStringArray(deliverables ?? [], 50), [deliverables])
  const brandsText = useMemo(() => {
    const brands = normalizeStringArray(pastCollaborations ?? [], 20)
    if (brands.length === 0) return t("results.mediaKit.pastCollaborations.empty")
    const max = 6
    const visible = brands.slice(0, max)
    const extra = Math.max(0, brands.length - visible.length)
    return `${visible.join(", ")}${extra > 0 ? ` +${extra}` : ""}`
  }, [pastCollaborations, t])

  const formatLabelMap: Record<string, string> = {
    reels: t("creatorCardEditor.formats.options.reels"),
    posts: t("creatorCardEditor.formats.options.posts"),
    stories: t("creatorCardEditor.formats.options.stories"),
    live: t("creatorCardEditor.formats.options.live"),
    ugc: t("creatorCardEditor.formats.options.ugc"),
    unboxing: t("creatorCardEditor.formats.options.unboxing"),
    giveaway: t("creatorCardEditor.formats.options.giveaway"),
    event: t("creatorCardEditor.formats.options.event"),
    affiliate: t("creatorCardEditor.formats.options.affiliate"),
  }

  const highlightClass = (active: boolean) =>
    active ? "ring-2 ring-emerald-400/70 bg-emerald-500/5 transition-colors" : ""

  const nichesHighlight = highlightClass(highlightTarget === "niches")
  const formatsHighlight = highlightClass(highlightTarget === "formats")
  const brandsHighlight = highlightClass(highlightTarget === "brands")

  const hasFollowers = typeof followersText === "string" && followersText.trim().length > 0
  const hasAvgLikes = typeof avgLikesText === "string" && avgLikesText.trim().length > 0
  const hasAvgComments = typeof avgCommentsText === "string" && avgCommentsText.trim().length > 0
  const showStatsRow = hasFollowers || hasAvgLikes || hasAvgComments

  const hasEngagementRate = typeof engagementRateText === "string" && engagementRateText.trim().length > 0
  const hasReach = typeof reachText === "string" && reachText.trim().length > 0
  const showKpiGrid = hasEngagementRate || hasReach

  return (
    <Card id={id} className={"min-w-0 " + (className ?? "")}>
      <CardHeader className={headerClassName}>
        <div className="flex items-start justify-between gap-3 min-w-0">
          <div className="min-w-0">
            <CardTitle className="text-base sm:text-xl font-bold text-white min-w-0 truncate leading-snug sm:leading-tight">{t("results.creatorCardPreview.title")}</CardTitle>
            <p className="mt-0 text-[10px] sm:text-sm text-slate-400 leading-snug min-w-0 truncate">{t("results.creatorCardPreview.subtitle")}</p>
          </div>
          {actions ? <div className="shrink-0">{actions}</div> : null}
        </div>
      </CardHeader>

      <CardContent className="p-4 lg:p-6">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-3 sm:p-4 lg:p-6 min-w-0">
          <div className="flex flex-col gap-4 min-w-0">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 md:gap-4 min-w-0">
              <div className="md:col-span-4 min-w-0">
                <div className="mx-auto w-full max-w-[240px] md:max-w-[280px] lg:max-w-[320px]">
                  <div className="rounded-xl border border-white/10 bg-black/20 overflow-hidden min-w-0">
                    <div className="aspect-[3/4] w-full">
                      {profileImageUrl ? (
                        <img
                          src={profileImageUrl}
                          alt="creator"
                          className="h-full w-full object-cover"
                          loading="lazy"
                          decoding="async"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="h-full w-full flex items-center justify-center text-sm text-white/50">—</div>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 min-w-0">
                    <div className="text-[clamp(18px,4.8vw,28px)] font-semibold text-white leading-tight break-words line-clamp-2 [overflow-wrap:anywhere]">
                      {resolvedDisplayName}
                    </div>
                    <div className="mt-0.5 text-sm text-white/65 min-w-0 truncate">@{resolvedUsername}</div>
                    <div className="mt-2 inline-flex items-center rounded-full border border-white/12 bg-white/5 px-3 py-1.5 text-[11px] font-semibold text-white/75 whitespace-nowrap">
                      {t("results.mediaKit.rolePill")}
                    </div>
                  </div>
                </div>
              </div>

              <div className="md:col-span-8 min-w-0">
                <div className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2.5 min-w-0 md:min-h-[320px] lg:min-h-[360px] flex flex-col">
                  <div className="text-[10px] tracking-widest font-semibold text-white/55">{t("results.mediaKit.about.title")}</div>
                  <div className="mt-1 text-xs sm:text-sm leading-snug text-white/45 min-w-0 break-words line-clamp-4 [overflow-wrap:anywhere]">
                    {resolvedAboutText}
                  </div>

                  <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 min-w-0">
                    <div className="min-w-0">
                      <div className="text-[10px] font-semibold text-white/55">{t("results.mediaKit.about.lines.primaryNiche")}</div>
                      <div className="mt-0.5 text-[12px] font-semibold text-white/45 min-w-0 truncate">{resolvedPrimaryNiche}</div>
                    </div>
                    <div className="min-w-0">
                      <div className="text-[10px] font-semibold text-white/55">{t("results.mediaKit.about.lines.audienceSummary")}</div>
                      <div className="mt-0.5 text-[12px] font-semibold text-white/45 min-w-0 truncate">{t("results.mediaKit.common.noData")}</div>
                    </div>
                  </div>

                  <div className={"mt-2 min-w-0 rounded-xl px-2 py-1.5 " + nichesHighlight}>
                    <div className="text-[10px] font-semibold text-white/55">{t("results.mediaKit.collaborationNiches.label")}</div>
                    <div className="mt-0.5 text-[12px] font-semibold text-white/45 min-w-0 break-words line-clamp-2 [overflow-wrap:anywhere]">
                      {nicheText}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {showStatsRow ? (
              <div className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2.5 sm:px-4 sm:py-3 min-w-0">
                <div className="flex items-stretch justify-between divide-x divide-white/10 min-w-0">
                  {hasFollowers ? (
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] font-semibold text-white/55 whitespace-nowrap">{t("results.mediaKit.stats.followers")}</div>
                      <div className="mt-1 text-[clamp(18px,5.2vw,26px)] font-semibold tabular-nums whitespace-nowrap text-white">
                        {followersText}
                      </div>
                    </div>
                  ) : null}

                  {hasAvgLikes ? (
                    <div className={(hasFollowers ? "flex-1 min-w-0 pl-3 sm:pl-4" : "flex-1 min-w-0") + (!hasFollowers ? " border-l-0" : "") }>
                      <div className="text-[10px] font-semibold text-white/55 whitespace-nowrap">{avgLikesLabel || "—"}</div>
                      <div className="mt-1 text-[clamp(18px,5.2vw,26px)] font-semibold tabular-nums whitespace-nowrap text-white">
                        {avgLikesText}
                      </div>
                    </div>
                  ) : null}

                  {hasAvgComments ? (
                    <div className={(hasFollowers || hasAvgLikes ? "flex-1 min-w-0 pl-3 sm:pl-4" : "flex-1 min-w-0") + (!hasFollowers && !hasAvgLikes ? " border-l-0" : "") }>
                      <div className="text-[10px] font-semibold text-white/55 whitespace-nowrap">{avgCommentsLabel || "—"}</div>
                      <div className="mt-1 text-[clamp(18px,5.2vw,26px)] font-semibold tabular-nums whitespace-nowrap text-white">
                        {avgCommentsText}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            {showKpiGrid ? (
              <div className="min-w-0">
                <div className="text-[11px] font-semibold tracking-wide text-white/70">{t("results.mediaKit.kpis.title")}</div>
                <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-2 min-w-0">
                  {(
                    [
                      hasEngagementRate
                        ? {
                            k: "engagementRate" as const,
                            label: t("results.mediaKit.kpis.labels.engagementRate"),
                            value: engagementRateText,
                            isNumeric: true,
                          }
                        : null,
                      hasReach
                        ? {
                            k: "avgReach" as const,
                            label: t("results.mediaKit.kpis.labels.avgReach"),
                            value: reachText,
                            isNumeric: true,
                          }
                        : null,
                    ].filter(Boolean) as Array<{ k: string; label: string; value: string | null; isNumeric: boolean }>
                  ).map((item) => (
                    <div key={item.k} className="rounded-xl border border-white/10 bg-white/5 px-2.5 py-1.5 min-w-0">
                      <div className="text-[10px] font-semibold text-white/55 whitespace-nowrap truncate">{item.label}</div>
                      <div
                        className={
                          "mt-0.5 text-[12px] font-semibold min-w-0 truncate " +
                          (item.value ? "text-white/80" : "text-white/40") +
                          (item.isNumeric ? " tabular-nums whitespace-nowrap" : "")
                        }
                      >
                        {item.value ? item.value : t("results.mediaKit.kpis.noData")}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="min-w-0">
              <div className="flex items-end justify-between gap-3 min-w-0">
                <div className="text-[11px] font-semibold tracking-wide text-white/70">{t("results.mediaKit.featured.title")}</div>
                <div className="text-[11px] text-white/45 whitespace-nowrap">{t("results.mediaKit.featured.empty")}</div>
              </div>

              <div className="mt-2 flex gap-2 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden min-w-0">
                {Array.from({ length: 5 }).map((_, idx) => (
                  <div key={idx} className="h-12 w-12 shrink-0 rounded-lg border border-white/10 bg-black/20" aria-hidden="true" />
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4 min-w-0">
              <div
                className={
                  "rounded-2xl border border-white/10 bg-black/20 p-3 sm:p-4 min-w-0 transition-colors " +
                  (highlightTarget === "formats" ? formatsHighlight : "") +
                  (highlightTarget === "brands" ? " " + brandsHighlight : "")
                }
              >
                <div className="text-[11px] font-semibold tracking-wide text-white/70">{t("results.mediaKit.collaborationFormats.title")}</div>
                <div className="mt-2 flex flex-wrap gap-2 min-w-0">
                  {formats.length === 0 ? (
                    <div className="text-[12px] leading-snug text-white/45">{t("results.mediaKit.collaborationFormats.empty")}</div>
                  ) : (
                    <>
                      {formats.slice(0, 6).map((id) => (
                        <span
                          key={id}
                          className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-semibold text-white/75"
                        >
                          {formatLabelMap[id] || id}
                        </span>
                      ))}
                      {formats.length > 6 ? (
                        <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-semibold text-white/55 whitespace-nowrap">
                          +{Math.max(0, formats.length - 6)}
                        </span>
                      ) : null}
                    </>
                  )}
                </div>

                <div className="mt-3 text-[11px] font-semibold tracking-wide text-white/70">{t("results.mediaKit.pastCollaborations.title")}</div>
                <div className="mt-2 text-[12px] leading-snug text-white/45 min-w-0 break-words line-clamp-3 [overflow-wrap:anywhere]">
                  {brandsText}
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/20 p-3 sm:p-4 min-w-0">
                <div className="text-[11px] font-semibold tracking-wide text-white/70">{t("results.mediaKit.contact.title")}</div>
                <div className="mt-2 space-y-2 text-[12px] leading-snug min-w-0">
                  <div className="min-w-0">
                    <div className="text-[10px] font-semibold text-white/55">{t("results.mediaKit.contact.email")}</div>
                    <div className="mt-0.5 font-semibold text-white/45 break-words [overflow-wrap:anywhere]">{t("results.mediaKit.contact.notProvided")}</div>
                  </div>
                  <div className="min-w-0">
                    <div className="text-[10px] font-semibold text-white/55">{t("results.mediaKit.contact.instagram")}</div>
                    <div className="mt-0.5 font-semibold text-white/45 break-words [overflow-wrap:anywhere]">{t("results.mediaKit.contact.notProvided")}</div>
                  </div>
                  <div className="min-w-0">
                    <div className="text-[10px] font-semibold text-white/55">{t("results.mediaKit.contact.other")}</div>
                    <div className="mt-0.5 font-semibold text-white/45 break-words [overflow-wrap:anywhere]">{t("results.mediaKit.contact.notProvided")}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
