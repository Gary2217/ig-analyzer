"use client"

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { ChevronLeft, ChevronRight, Plus } from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

 function asRecord(value: unknown): Record<string, unknown> | null {
   if (!value || typeof value !== "object") return null
   return value as Record<string, unknown>
 }

 function isPlainRecord(value: unknown): value is Record<string, unknown> {
   return Boolean(value) && typeof value === "object" && !Array.isArray(value)
 }

export type CreatorCardPreviewHighlightTarget = "formats" | "niches" | "brands" | null

export type CreatorCardPreviewProps = {
  t: (key: string) => string
  className?: string
  id?: string
  headerClassName?: string
  actions?: ReactNode

  useWidePhotoLayout?: boolean
  photoUploadEnabled?: boolean

  onProfileImageFileChange?: (file: File | null) => void

  profileImageUrl?: string | null
  displayName?: string | null
  username?: string | null

  aboutText?: string | null
  primaryNiche?: string | null

  contact?: unknown

  featuredItems?: { id: string; url: string; brand?: string | null; collabType?: string | null }[]

  featuredImageUrls?: (string | null)[]

  themeTypes?: string[] | null
  audienceProfiles?: string[] | null

  collaborationNiches?: string[] | null
  deliverables?: string[] | null
  pastCollaborations?: string[] | null

  followersText?: string | null
  postsText?: string | null
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

const Pill = ({ children }: { children: React.ReactNode }) => (
  <span className="inline-flex max-w-full items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm text-white/90">
    <span className="truncate">{children}</span>
  </span>
)

export function CreatorCardPreview(props: CreatorCardPreviewProps) {
  const {
    t,
    id,
    className,
    headerClassName,
    actions,
    useWidePhotoLayout,
    photoUploadEnabled,
    onProfileImageFileChange,
    profileImageUrl,
    displayName,
    username,
    aboutText,
    primaryNiche,
    contact,
    featuredItems,
    featuredImageUrls,
    themeTypes,
    audienceProfiles,
    collaborationNiches,
    deliverables,
    pastCollaborations,
    followersText,
    postsText,
    avgLikesLabel,
    avgLikesText,
    avgCommentsLabel,
    avgCommentsText,
    engagementRateText,
    reachText,
    highlightTarget,
  } = props

  const bioText = typeof aboutText === "string" && aboutText.trim() ? aboutText.trim() : ""
  const themeTypeText = useMemo(() => normalizeStringArray(themeTypes ?? [], 20), [themeTypes])
  const audienceProfileText = useMemo(() => normalizeStringArray(audienceProfiles ?? [], 20), [audienceProfiles])

  const resolvedAboutText = (() => {
    if (bioText) return bioText
    if (themeTypeText.length > 0) return themeTypeText.join(" · ")
    if (audienceProfileText.length > 0) return audienceProfileText.join(" · ")
    return t("results.mediaKit.about.placeholder")
  })()

  const resolvedPrimaryNiche = (() => {
    if (typeof primaryNiche === "string" && primaryNiche.trim()) return primaryNiche.trim()
    if (themeTypeText.length > 0) return themeTypeText.join(" · ")
    return t("results.mediaKit.common.noData")
  })()

  const audienceSummaryText = audienceProfileText.length > 0 ? audienceProfileText.join(" · ") : t("results.mediaKit.common.noData")

  const resolvedDisplayName = typeof displayName === "string" && displayName.trim() ? displayName.trim() : "—"
  const resolvedUsername = typeof username === "string" && username.trim() ? username.trim() : "—"

  const parsedContact = useMemo(() => {
    const readStr = (v: unknown) => (typeof v === "string" ? v.trim() : "")
    const readStrArr = (v: unknown) =>
      Array.isArray(v) ? v.map((x) => readStr(x)).filter(Boolean) : ([] as string[])
    const readStrOrArr = (v: unknown) => {
      const arr = readStrArr(v)
      if (arr.length > 0) return arr
      const s = readStr(v)
      return s ? [s] : ([] as string[])
    }

    let obj: unknown = contact
    if (typeof obj === "string") {
      const raw = obj.trim()
      if (!raw) return { email: "", instagram: "", other: "" }
      try {
        obj = JSON.parse(raw)
      } catch {
        obj = {}
      }
    }

    const contactObj: Record<string, unknown> = isPlainRecord(obj) ? obj : {}

    const emails = readStrArr(contactObj.emails)
    const instagrams = readStrArr(contactObj.instagrams)
    const others = readStrArr(contactObj.others)

    const emailArrFromEmailKey = readStrOrArr(contactObj.email)
    const instagramArrFromInstagramKey = readStrOrArr(contactObj.instagram)
    const otherArrFromOtherKey = readStrOrArr(contactObj.other)

    const emailArrFromLegacyKey = readStrOrArr(contactObj.contactEmail)
    const instagramArrFromLegacyKey = readStrOrArr(contactObj.contactInstagram)
    const otherArrFromLegacyKey = readStrOrArr(contactObj.contactOther)

    const finalEmails =
      emails.length ? emails : emailArrFromEmailKey.length ? emailArrFromEmailKey : emailArrFromLegacyKey
    const finalInstagrams =
      instagrams.length
        ? instagrams
        : instagramArrFromInstagramKey.length
          ? instagramArrFromInstagramKey
          : instagramArrFromLegacyKey
    const finalOthers = others.length ? others : otherArrFromOtherKey.length ? otherArrFromOtherKey : otherArrFromLegacyKey

    const emailText = finalEmails.join(", ")
    const instagramText = finalInstagrams.join(", ")
    const otherText = finalOthers.join(", ")

    return {
      email: emailText,
      instagram: instagramText,
      other: otherText,
      emails: finalEmails,
      instagrams: finalInstagrams,
      others: finalOthers,
    }
  }, [contact])

  const hasContact =
    (typeof parsedContact.email === "string" && parsedContact.email.trim().length > 0) ||
    (typeof parsedContact.instagram === "string" && parsedContact.instagram.trim().length > 0) ||
    (typeof parsedContact.other === "string" && parsedContact.other.trim().length > 0)

  const featuredTiles = useMemo(() => {
    const rawItems = Array.isArray(featuredItems) ? featuredItems : []
    const out: Array<{ id: string; url: string; brand: string; collabType: string }> = []

    if (rawItems.length > 0) {
      for (const item of rawItems) {
        const id = typeof item?.id === "string" && item.id ? item.id : `${out.length}`
        out.push({
          id,
          url: typeof item?.url === "string" ? item.url.trim() : "",
          brand: typeof item?.brand === "string" ? item.brand.trim() : "",
          collabType: typeof item?.collabType === "string" ? item.collabType.trim() : "",
        })
      }
      return out
    }

    const rawUrls = Array.isArray(featuredImageUrls) ? featuredImageUrls : []
    for (let i = 0; i < rawUrls.length; i++) {
      const item = rawUrls[i]
      if (typeof item !== "string") continue
      const s = item.trim()
      if (!s) continue
      out.push({ id: String(i), url: s, brand: "", collabType: "" })
    }
    return out
  }, [featuredImageUrls, featuredItems])

  const featuredCount = featuredTiles.length

  const featuredStripRef = useRef<HTMLDivElement | null>(null)

  const [featuredHasOverflow, setFeaturedHasOverflow] = useState(false)
  const [canScrollFeaturedLeft, setCanScrollFeaturedLeft] = useState(false)
  const [canScrollFeaturedRight, setCanScrollFeaturedRight] = useState(false)

  const updateFeaturedScrollState = useCallback(() => {
    const el = featuredStripRef.current
    if (!el) {
      setFeaturedHasOverflow(false)
      setCanScrollFeaturedLeft(false)
      setCanScrollFeaturedRight(false)
      return
    }
    const left = el.scrollLeft
    const clientWidth = el.clientWidth
    const scrollWidth = el.scrollWidth
    const hasOverflow = scrollWidth > clientWidth + 1
    setFeaturedHasOverflow(hasOverflow)

    setCanScrollFeaturedLeft(left > 0)
    setCanScrollFeaturedRight(left + clientWidth < scrollWidth - 1)
  }, [])

  const getFeaturedScrollStep = useCallback(() => {
    const el = featuredStripRef.current
    if (!el) return 220
    const child = el.firstElementChild as HTMLElement | null
    const width = child ? child.getBoundingClientRect().width : 204
    const gap = 16
    return Math.max(120, Math.round(width + gap))
  }, [])

  const scrollFeaturedBy = useCallback(
    (dir: -1 | 1) => {
      const el = featuredStripRef.current
      if (!el) return
      const step = getFeaturedScrollStep()
      el.scrollBy({ left: dir * step, behavior: "smooth" })

      requestAnimationFrame(() => {
        updateFeaturedScrollState()
      })
    },
    [getFeaturedScrollStep, updateFeaturedScrollState]
  )

  useEffect(() => {
    const el = featuredStripRef.current
    if (!el) return

    const raf = window.requestAnimationFrame(() => {
      updateFeaturedScrollState()
    })

    const onScroll = () => updateFeaturedScrollState()
    el.addEventListener("scroll", onScroll, { passive: true })
    window.addEventListener("resize", updateFeaturedScrollState)

    let ro: ResizeObserver | null = null
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => updateFeaturedScrollState())
      ro.observe(el)
    }

    return () => {
      window.cancelAnimationFrame(raf)
      el.removeEventListener("scroll", onScroll)
      window.removeEventListener("resize", updateFeaturedScrollState)
      if (ro) ro.disconnect()
    }
  }, [featuredCount, updateFeaturedScrollState])

  const [photoOverrideUrl, setPhotoOverrideUrl] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    return () => {
      if (photoOverrideUrl) URL.revokeObjectURL(photoOverrideUrl)
    }
  }, [photoOverrideUrl])

  const effectivePhotoUrl = photoOverrideUrl ?? profileImageUrl ?? null
  const wideLayout = Boolean(useWidePhotoLayout)
  const leftSpanClassName = wideLayout ? "md:col-span-4" : "md:col-span-3"
  const rightSpanClassName = wideLayout ? "md:col-span-8" : "md:col-span-9"
  const photoMaxWidthClassName = wideLayout
    ? "max-w-[280px] md:max-w-[340px] lg:max-w-[400px]"
    : "max-w-[240px] md:max-w-[280px] lg:max-w-[320px]"

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
  const brands = useMemo(() => normalizeStringArray(pastCollaborations ?? [], Number.POSITIVE_INFINITY), [pastCollaborations])

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
    tiktok: t("creatorCardEditor.formats.options.tiktok"),
    youtube: t("creatorCardEditor.formats.options.youtube"),
    fb_post: t("creatorCardEditor.formats.options.fbPost"),
    fb: t("creatorCardEditor.formats.options.fbPost"),
    facebook: t("creatorCardEditor.formats.options.fbPost"),
    other: t("creatorCardEditor.formats.options.other"),
  }

  const highlightClass = (active: boolean) =>
    active ? "ring-2 ring-emerald-400/70 bg-emerald-500/5 transition-colors" : ""

  const nichesHighlight = highlightClass(highlightTarget === "niches")
  const formatsHighlight = highlightClass(highlightTarget === "formats")
  const brandsHighlight = highlightClass(highlightTarget === "brands")

  const hasFollowers = typeof followersText === "string" && followersText.trim().length > 0
  const hasPosts = typeof postsText === "string" && postsText.trim().length > 0
  const hasEngagementRate = typeof engagementRateText === "string" && engagementRateText.trim().length > 0
  const showStatsRow = hasFollowers || hasPosts || hasEngagementRate

  const hasReach = typeof reachText === "string" && reachText.trim().length > 0
  const showKpiGrid = hasReach

  return (
    <Card id={id} className={"min-w-0 " + (className ?? "")}>
      <CardHeader className={headerClassName}>
        <div className="w-full flex flex-wrap items-start sm:items-center gap-2">
          <div className="min-w-0">
            <CardTitle className="text-base sm:text-xl font-bold text-white min-w-0 truncate leading-snug sm:leading-tight">{t("results.creatorCardPreview.title")}</CardTitle>
            <p className="mt-0 text-[10px] sm:text-sm text-slate-400 leading-snug min-w-0 truncate">{t("results.creatorCardPreview.subtitle")}</p>
          </div>
          {actions ? <div className="ml-auto flex flex-wrap items-center justify-end gap-2">{actions}</div> : null}
        </div>
      </CardHeader>

      <CardContent className="p-4 lg:p-6">
        <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-3 sm:p-4 lg:p-6 min-w-0">
            <div className="flex flex-col gap-4 min-w-0">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 md:gap-4 min-w-0 items-stretch">
              <div className={leftSpanClassName + " min-w-0 h-full flex"}>
                <div className={"mx-auto w-full " + photoMaxWidthClassName + " h-full flex flex-col"}>
                  <div className="rounded-xl border border-white/10 bg-black/20 overflow-hidden min-w-0">
                    <div className="aspect-[3/4] w-full">
                      {effectivePhotoUrl ? (
                        <img
                          src={effectivePhotoUrl}
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

                  {photoUploadEnabled ? (
                    <div className="mt-2">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0] ?? null
                          if (!file) {
                            if (typeof onProfileImageFileChange === "function") {
                              onProfileImageFileChange(null)
                            }
                            return
                          }
                          const nextUrl = URL.createObjectURL(file)
                          setPhotoOverrideUrl((prev) => {
                            if (prev) URL.revokeObjectURL(prev)
                            return nextUrl
                          })

                          if (typeof onProfileImageFileChange === "function") {
                            onProfileImageFileChange(file)
                          }
                        }}
                      />
                      <button
                        type="button"
                        className="w-full rounded-md border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold text-white/80 hover:bg-white/10"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        上傳照片
                      </button>
                    </div>
                  ) : null}

                  <div className="mt-auto pt-3 min-w-0">
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

              <div className={rightSpanClassName + " min-w-0"}>
                <div className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2.5 min-w-0 md:min-h-[320px] lg:min-h-[360px] flex flex-col">
                  <div className="text-[10px] tracking-widest font-semibold text-white/55">{t("results.mediaKit.about.title")}</div>
                  <div className="mt-1 min-w-0">
                    <Pill>{resolvedAboutText}</Pill>
                  </div>

                  <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 min-w-0">
                    <div className="min-w-0">
                      <div className="text-[10px] font-semibold text-white/55">{t("results.mediaKit.about.lines.primaryNiche")}</div>
                      <div className="mt-0.5 min-w-0">
                        <Pill>{resolvedPrimaryNiche}</Pill>
                      </div>
                    </div>
                    <div className="min-w-0">
                      <div className="text-[10px] font-semibold text-white/55">{t("results.mediaKit.about.lines.audienceSummary")}</div>
                      <div className="mt-0.5 min-w-0">
                        <Pill>{audienceSummaryText}</Pill>
                      </div>
                    </div>
                  </div>

                  <div className={"mt-2 min-w-0 rounded-xl px-2 py-1.5 " + nichesHighlight}>
                    <div className="text-[10px] font-semibold text-white/55">{t("results.mediaKit.collaborationNiches.label")}</div>
                    <div className="mt-0.5 min-w-0">
                      <Pill>{nicheText}</Pill>
                    </div>
                  </div>

                  <div className={"mt-2 min-w-0 rounded-xl px-2 py-1.5 " + formatsHighlight}>
                    <div className="text-[10px] font-semibold text-white/55">{t("results.mediaKit.collaborationFormats.title")}</div>
                    <div className="mt-2 flex flex-wrap gap-2 min-w-0">
                      {formats.length === 0 ? (
                        <div className="text-[12px] leading-snug text-white/45">{t("results.mediaKit.collaborationFormats.empty")}</div>
                      ) : (
                        <>
                          {formats.map((id) => (
                            <span
                              key={id}
                              className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-semibold text-white/75 min-w-0 max-w-[220px] truncate whitespace-nowrap"
                            >
                              {formatLabelMap[id] || id}
                            </span>
                          ))}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              </div>

              {showStatsRow ? (
              <div className="rounded-2xl border border-white/10 bg-black/20 px-2.5 py-1.5 sm:px-3 sm:py-2 min-w-0">
                <div className="flex items-stretch justify-between divide-x divide-white/10 min-w-0">
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] font-semibold text-white/55 whitespace-nowrap">{t("results.mediaKit.stats.followers")}</div>
                    <div className="mt-0.5 text-[clamp(14px,4.2vw,18px)] font-semibold tabular-nums whitespace-nowrap text-white min-w-0 truncate">
                      {hasFollowers ? followersText : "—"}
                    </div>
                  </div>

                  <div className="flex-1 min-w-0 pl-2.5 sm:pl-3">
                    <div className="text-[10px] font-semibold text-white/55 whitespace-nowrap">{t("results.mediaKit.stats.posts")}</div>
                    <div className="mt-0.5 text-[clamp(14px,4.2vw,18px)] font-semibold tabular-nums whitespace-nowrap text-white min-w-0 truncate">
                      {hasPosts ? postsText : "—"}
                    </div>
                  </div>

                  <div className="flex-1 min-w-0 pl-2.5 sm:pl-3">
                    <div className="text-[10px] font-semibold text-white/55 whitespace-nowrap">{t("results.mediaKit.kpis.labels.engagementRate")}</div>
                    <div className="mt-0.5 text-[clamp(14px,4.2vw,18px)] font-semibold tabular-nums whitespace-nowrap text-white min-w-0 truncate">
                      {hasEngagementRate ? engagementRateText : "—"}
                    </div>
                  </div>
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
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold tracking-wide text-white/70">作品集展示</div>
                  <div className="mt-0.5 text-[11px] text-white/45">展示你的熱門貼文或合作作品</div>
                </div>
                <div className="shrink-0 flex items-center gap-2">
                  <div className="text-[11px] text-white/35 whitespace-nowrap">已新增 {featuredCount} 件作品</div>
                </div>
              </div>

              <div className="relative mt-3 min-w-0">
                <div
                  ref={featuredStripRef}
                  className="flex gap-4 overflow-x-auto min-w-0 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                >
                  {featuredCount === 0 ? (
                    <div className="shrink-0 w-[150px] md:w-[170px] aspect-[3/4] overflow-hidden rounded-2xl border border-white/10 bg-white/5">
                      <div className="h-full w-full flex items-center justify-center">
                        <Plus className="h-7 w-7 text-white/25" />
                      </div>
                    </div>
                  ) : (
                    featuredTiles.map((item) => (
                      <div
                        key={item.id}
                        className="relative shrink-0 w-[150px] md:w-[170px] aspect-[3/4] overflow-hidden rounded-2xl border border-white/10 bg-white/5"
                      >
                        {item.url ? (
                          <img src={item.url} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <div className="h-full w-full flex items-center justify-center">
                            <Plus className="h-7 w-7 text-white/25" />
                          </div>
                        )}

                        {item.brand || item.collabType ? (
                          <div className="absolute bottom-2 left-2 flex flex-wrap items-center gap-1.5">
                            {item.brand ? (
                              <span className="inline-flex items-center rounded-full bg-black/40 px-2 py-1 text-[12px] font-semibold text-white/90 backdrop-blur">
                                {item.brand}
                              </span>
                            ) : null}
                            {item.collabType ? (
                              <span className="inline-flex items-center rounded-full bg-black/35 px-2 py-1 text-[11px] font-semibold text-white/85 backdrop-blur">
                                {item.collabType}
                              </span>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    ))
                  )}
                </div>

                {canScrollFeaturedRight ? (
                  <div className="pointer-events-none absolute right-0 top-0 h-full w-14 bg-gradient-to-l from-black/55 to-transparent" />
                ) : null}
                {canScrollFeaturedLeft ? (
                  <div className="pointer-events-none absolute left-0 top-0 h-full w-10 bg-gradient-to-r from-black/55 to-transparent" />
                ) : null}

                {featuredCount > 1 && featuredHasOverflow ? (
                  <>
                    <button
                      type="button"
                      onClick={() => scrollFeaturedBy(-1)}
                      disabled={!canScrollFeaturedLeft}
                      className="pointer-events-auto absolute left-2 top-1/2 z-20 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/30 text-white/85 backdrop-blur hover:bg-black/40 disabled:opacity-30 disabled:pointer-events-none"
                      aria-label="scroll left"
                    >
                      <ChevronLeft className="h-5 w-5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => scrollFeaturedBy(1)}
                      disabled={!canScrollFeaturedRight}
                      className="pointer-events-auto absolute right-2 top-1/2 z-20 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/30 text-white/85 backdrop-blur hover:bg-black/40 disabled:opacity-30 disabled:pointer-events-none"
                      aria-label="scroll right"
                    >
                      <ChevronRight className="h-5 w-5" />
                    </button>
                  </>
                ) : null}
              </div>
            </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4 min-w-0">
              <div
                className={
                  "rounded-2xl border border-white/10 bg-black/20 p-3 sm:p-4 min-w-0 transition-colors " +
                  (highlightTarget === "brands" ? " " + brandsHighlight : "")
                }
              >
                <div className="text-[11px] font-semibold tracking-wide text-white/70">{t("results.mediaKit.pastCollaborations.title")}</div>
                <div className="mt-2 flex flex-wrap gap-2 min-w-0">
                  {brands.length === 0 ? (
                    <div className="text-[12px] leading-snug text-white/45">{t("results.mediaKit.pastCollaborations.empty")}</div>
                  ) : (
                    <>
                      {brands.map((brand) => (
                        <span
                          key={brand}
                          className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-semibold text-white/75 min-w-0 max-w-full truncate whitespace-nowrap"
                        >
                          <span className="min-w-0 truncate">{brand}</span>
                          <span className="shrink-0 text-white/35" aria-hidden="true">×</span>
                        </span>
                      ))}
                    </>
                  )}
                </div>
              </div>

              {hasContact ? (
                <div className="rounded-2xl border border-white/10 bg-black/20 p-3 sm:p-4 min-w-0">
                  <div className="text-[11px] font-semibold tracking-wide text-white/70">{t("results.mediaKit.contact.title")}</div>
                  <div className="mt-2 space-y-2 text-[12px] leading-snug min-w-0">
                    <div className="min-w-0">
                      <div className="text-[10px] font-semibold text-white/55">{t("results.mediaKit.contact.email")}</div>
                      <div className="mt-0.5 min-w-0">
                        <Pill>{parsedContact.email ? parsedContact.email : t("results.mediaKit.contact.notProvided")}</Pill>
                      </div>
                    </div>
                    <div className="min-w-0">
                      <div className="text-[10px] font-semibold text-white/55">{t("results.mediaKit.contact.instagram")}</div>
                      <div className="mt-0.5 min-w-0">
                        <Pill>{parsedContact.instagram ? parsedContact.instagram : t("results.mediaKit.contact.notProvided")}</Pill>
                      </div>
                    </div>
                    <div className="min-w-0">
                      <div className="text-[10px] font-semibold text-white/55">{t("results.mediaKit.contact.other")}</div>
                      <div className="mt-0.5 min-w-0">
                        <Pill>{parsedContact.other ? parsedContact.other : t("results.mediaKit.contact.notProvided")}</Pill>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
