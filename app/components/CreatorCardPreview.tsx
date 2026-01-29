"use client"

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import Image from "next/image"
import { ChevronLeft, ChevronRight, Plus, Sparkles, X, GripVertical } from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { COLLAB_TYPE_OPTIONS, collabTypeLabelKey, type CollabTypeOptionId } from "../lib/creatorCardOptions"
import { MobileCreatorCardLayout } from "./creator-card/MobileCreatorCardLayout"
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"

// Strict oEmbed types
type OEmbedStatus = "idle" | "loading" | "success" | "error"

type OEmbedSuccess = {
  ok: true
  data?: {
    thumbnail_url?: string
    thumbnail_width?: number
    thumbnail_height?: number
    title?: string
    author_name?: string
    provider_name?: string
  }
  [k: string]: any
}

type OEmbedError = {
  ok: false
  error?: { status?: number; message?: string } | any
  [k: string]: any
}

type OEmbedResponse = OEmbedSuccess | OEmbedError

type OEmbedState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: OEmbedResponse }
  | { status: "error"; errorMessage?: string; httpStatus?: number }

// Strict fetch helper: NEVER returns null, always returns explicit ok/error shape
async function fetchOEmbedStrict(url: string): Promise<OEmbedResponse> {
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 8000)
    
    const res = await fetch(`/api/ig/oembed?url=${encodeURIComponent(url)}`, {
      method: "GET",
      signal: controller.signal,
      cache: "no-store",
      headers: { "cache-control": "no-cache", pragma: "no-cache" },
    })
    
    clearTimeout(timeoutId)

    let json: any = null
    try {
      json = await res.json()
    } catch {
      // JSON parse failed
    }

    // If HTTP is not ok => treat as error
    if (!res.ok) {
      return {
        ok: false,
        error: {
          status: res.status,
          message: json?.error?.message ?? "Failed to load Instagram preview",
        },
      } as OEmbedError
    }

    // If API returns ok:false => treat as error
    if (json?.ok === false) {
      return json as OEmbedError
    }

    // Otherwise success
    return (json ?? { ok: true }) as OEmbedSuccess
  } catch (e: any) {
    // Network error, timeout, etc.
    return {
      ok: false,
      error: {
        status: 0,
        message: e?.message ?? "Network error",
      },
    } as OEmbedError
  }
}

// Safe fetch helper for non-oEmbed calls: never throws, returns null on any failure
async function safeFetchJson<T = any>(input: RequestInfo | URL, init?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(input, init)
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

// Instagram embed preview component (reused from editor)
function IgEmbedPreview({ url }: { url: string }) {
  const embedRef = useRef<HTMLDivElement>(null)
  const [embedLoaded, setEmbedLoaded] = useState(false)

  useEffect(() => {
    if (!window.instgrm) {
      const script = document.createElement("script")
      script.src = "https://www.instagram.com/embed.js"
      script.async = true
      script.onload = () => {
        setEmbedLoaded(true)
        if (window.instgrm?.Embeds) {
          window.instgrm.Embeds.process()
        }
      }
      document.body.appendChild(script)
    } else {
      setEmbedLoaded(true)
      if (window.instgrm?.Embeds) {
        window.instgrm.Embeds.process()
      }
    }
  }, [])

  useEffect(() => {
    if (embedLoaded && window.instgrm?.Embeds) {
      const process = () => {
        if (window.instgrm?.Embeds) {
          window.instgrm.Embeds.process()
        }
      }
      requestAnimationFrame(process)
      setTimeout(process, 250)
      setTimeout(process, 1000)
    }
  }, [url, embedLoaded])

  return (
    <div ref={embedRef} className="w-full max-w-full rounded-lg">
      <blockquote
        className="instagram-media"
        data-instgrm-permalink={url}
        data-instgrm-version="14"
        style={{ width: "100%", maxWidth: "100%", minWidth: "auto", margin: "0 auto" }}
      >
        <div className="p-4 rounded-lg bg-white/5 border border-white/10 text-center">
          <p className="text-xs text-white/60">Loading Instagram post...</p>
        </div>
      </blockquote>
    </div>
  )
}

// Declare Instagram embed global
declare global {
  interface Window {
    instgrm?: {
      Embeds?: {
        process: () => void
      }
    }
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

// Sortable preview item component
function SortablePreviewItem({
  item,
  children,
  onItemClick,
}: {
  item: { id: string }
  children: React.ReactNode
  onItemClick?: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  })
  const justDraggedAtRef = useRef<number>(0)

  // Update timestamp when drag ends
  useEffect(() => {
    if (!isDragging && justDraggedAtRef.current > 0) {
      justDraggedAtRef.current = Date.now()
    }
  }, [isDragging])

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    touchAction: 'none' as const,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="relative"
      {...attributes}
      {...listeners}
      onClick={(e) => {
        const now = Date.now()
        if (now - justDraggedAtRef.current < 400) {
          e.preventDefault()
          e.stopPropagation()
          return
        }
        onItemClick?.()
      }}
    >
      {children}
    </div>
  )
}

function getCollabTypeDisplayLabel(collabType: string, t: (key: string) => string): string {
  const raw = collabType.trim()
  if (!raw) return ""
  
  const normalized = raw.toLowerCase()
  
  if (COLLAB_TYPE_OPTIONS.includes(normalized as CollabTypeOptionId)) {
    return t(collabTypeLabelKey(normalized as CollabTypeOptionId))
  }
  
  return raw
}

export type CreatorCardPreviewHighlightTarget = "formats" | "niches" | "brands" | null

// Helper to extract Instagram shortcode from URL
function extractInstagramShortcode(inputUrl: string): { kind: string; code: string } | null {
  try {
    const u = new URL(inputUrl)
    if (!/instagram\.com$/i.test(u.hostname) && !/(\.|^)instagram\.com$/i.test(u.hostname)) return null

    // Normalize pathname and extract shortcode for /p/{code}/, /reel/{code}/, /tv/{code}/
    const parts = u.pathname.split("/").filter(Boolean)
    if (parts.length < 2) return null

    const kind = parts[0] // p | reel | tv
    const code = parts[1]
    if (!code) return null

    if (kind !== "p" && kind !== "reel" && kind !== "tv") return null

    return { kind, code }
  } catch {
    return null
  }
}

// Helper to generate direct Instagram media URL (no oEmbed required)
function buildInstagramDirectMediaUrl(inputUrl: string): string | null {
  const extracted = extractInstagramShortcode(inputUrl)
  if (!extracted) return null
  
  // Direct media URL format: https://www.instagram.com/p/{code}/media/?size=l
  return `https://www.instagram.com/${extracted.kind}/${extracted.code}/media/?size=l`
}

// Helper to build Instagram embed iframe src (used only for modal)
function buildInstagramEmbedSrc(inputUrl: string): string | null {
  const extracted = extractInstagramShortcode(inputUrl)
  if (!extracted) return null
  
  // captioned embed tends to be more reliable for previews
  return `https://www.instagram.com/${extracted.kind}/${extracted.code}/embed/captioned/`
}


export type CreatorCardPreviewProps = {
  t: (key: string) => string
  locale?: string
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

  featuredItems?: { id: string; url: string; brand?: string | null; collabType?: string | null; caption?: string | null; type?: string | null; title?: string | null; text?: string | null; isAdded?: boolean | null; thumbnailUrl?: string | null }[]
  onReorderIgIds?: (nextIgIds: string[]) => void

  featuredImageUrls?: (string | null)[]

  themeTypes?: string[] | null
  audienceProfiles?: string[] | null

  collaborationNiches?: string[] | null
  deliverables?: string[] | null
  pastCollaborations?: string[] | null

  followers?: number
  following?: number
  posts?: number
  engagementRate?: number

  followersText?: string | null
  postsText?: string | null
  avgLikesLabel?: string | null
  avgLikesText?: string | null
  avgCommentsLabel?: string | null
  avgCommentsText?: string | null
  engagementRateText?: string | null
  reachText?: string | null

  highlightTarget?: CreatorCardPreviewHighlightTarget
  highlightSection?: "about" | "primaryNiche" | "audienceSummary" | "collaborationNiches" | "contact" | "formats" | null

  igOEmbedCache?: Record<string, OEmbedState>
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

type PillProps = {
  children: React.ReactNode
  clampLines?: 1 | 2 | 3
  title?: string
  className?: string
  unstyled?: boolean
}

const Pill = ({ children, clampLines = 1, title, className, unstyled }: PillProps) => {
  const clamp =
    clampLines === 3 ? "line-clamp-3" : clampLines === 2 ? "line-clamp-2" : "truncate"

  const baseWrapper = "inline-flex min-w-0 max-w-full"
  const wrapperClassName = unstyled
    ? baseWrapper
    : [
        baseWrapper,
        "items-center rounded-full border border-white/10 bg-white/[0.05]",
        "px-2.5 py-1 text-[12px] text-white/85",
        "focus-within:ring-1 focus-within:ring-white/10",
      ].join(" ")

  return (
    <span
      title={title}
      className={wrapperClassName}
    >
      <span className={["min-w-0 block", clamp, className].filter(Boolean).join(" ")}>{children}</span>
    </span>
  )
}

export function CreatorCardPreviewCard(props: CreatorCardPreviewProps) {
  const {
    t,
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
    followers,
    following,
    posts,
    engagementRate,
    followersText,
    postsText,
    engagementRateText,
    reachText,
    highlightTarget,
    highlightSection,
  } = props

  // Modal state for IG post preview
  const [openIg, setOpenIg] = useState<{ url: string; thumb?: string; caption?: string | null } | null>(null)
  const [openAvatarUrl, setOpenAvatarUrl] = useState<string | null>(null)
  const [igOEmbedCache, setIgOEmbedCache] = useState<Record<string, OEmbedState>>(props.igOEmbedCache || {})
  const modalBodyRef = useRef<HTMLDivElement>(null)
  const igModalBodyRef = useRef<HTMLDivElement>(null)

  // Reset scroll position when modal opens
  useEffect(() => {
    if (openIg && igModalBodyRef.current) {
      // Reset body scroll to top immediately
      requestAnimationFrame(() => {
        if (igModalBodyRef.current) {
          igModalBodyRef.current.scrollTo({ top: 0, left: 0, behavior: "auto" })
        }
      })
    }
  }, [openIg])

  const [thumbnailLoadErrors, setThumbnailLoadErrors] = useState<Record<string, boolean>>({})
  const [retryKeys, setRetryKeys] = useState<Record<string, number>>({})
  const [previewCarouselIndex, setPreviewCarouselIndex] = useState(0)
  const previewCarouselRef = useRef<HTMLDivElement>(null)
  const [canScrollPreviewLeft, setCanScrollPreviewLeft] = useState(false)
  const [canScrollPreviewRight, setCanScrollPreviewRight] = useState(false)

  // DnD sensors for drag-reorder
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        delay: 150,
        tolerance: 5,
      },
    })
  )

  // Helper to normalize URL (remove trailing slash)
  const normalizeUrl = (url: string) => url ? url.trim().replace(/\/$/, "") : ""

  // Helper to check if item is an added IG post
  const isAddedIg = (item: any) => {
    const normalizedUrl = normalizeUrl(item.url)
    const isIg = item.type === "ig" || (item.type == null && normalizedUrl && (normalizedUrl.includes("instagram.com/p/") || normalizedUrl.includes("instagram.com/reel/") || normalizedUrl.includes("instagram.com/tv/")))
    const hasUrl = !!normalizedUrl
    const isAdded = item.isAdded === true || item.isAdded === undefined
    return isIg && hasUrl && isAdded
  }

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

  const audienceSummaryText =
    audienceProfileText.length > 0 ? audienceProfileText.join(" · ") : t("results.mediaKit.common.noData")

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
    const finalOthers =
      others.length ? others : otherArrFromOtherKey.length ? otherArrFromOtherKey : otherArrFromLegacyKey

    return {
      email: finalEmails.join(", "),
      instagram: finalInstagrams.join(", "),
      other: finalOthers.join(", "),
    }
  }, [contact])

  const hasContact =
    (typeof parsedContact.email === "string" && parsedContact.email.trim().length > 0) ||
    (typeof parsedContact.instagram === "string" && parsedContact.instagram.trim().length > 0) ||
    (typeof parsedContact.other === "string" && parsedContact.other.trim().length > 0)

  const featuredTiles = useMemo(() => {
    // Robust fallback: try multiple possible sources for featured items
    // This ensures Results page works even if API returns snake_case or nested structures
    const rawItems = Array.isArray(featuredItems) 
      ? featuredItems 
      : Array.isArray((featuredItems as any)?.items)
        ? (featuredItems as any).items
        : []
    
    const out: Array<{ id: string; url: string; brand: string; collabType: string; caption?: string; type?: string; title?: string; text?: string; isAdded?: boolean; thumbnailUrl?: string }> = []

    if (rawItems.length > 0) {
      for (const item of rawItems) {
        const id = typeof item?.id === "string" && item.id ? item.id : `${out.length}`
        out.push({
          id,
          url: typeof item?.url === "string" ? item.url.trim() : "",
          brand: typeof item?.brand === "string" ? item.brand.trim() : "",
          collabType: typeof item?.collabType === "string" ? item.collabType.trim() : "",
          caption: typeof item?.caption === "string" ? item.caption.trim() : undefined,
          type: typeof item?.type === "string" ? item.type.trim() : undefined,
          title: typeof item?.title === "string" ? item.title.trim() : undefined,
          text: typeof item?.text === "string" ? item.text.trim() : undefined,
          isAdded: typeof item?.isAdded === "boolean" ? item.isAdded : undefined,
          thumbnailUrl: typeof item?.thumbnailUrl === "string" ? item.thumbnailUrl.trim() : undefined,
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

  // Build sortable IG items array (only added IG items)
  const sortableIg = useMemo(() => {
    return (featuredItems || []).filter(x => x.type === "ig" && x.isAdded === true)
  }, [featuredItems])

  const sortableIds = useMemo(() => sortableIg.map(x => x.id), [sortableIg])

  // Handle drag end for reordering
  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    if (!props.onReorderIgIds) return

    const oldIndex = sortableIds.indexOf(String(active.id))
    const newIndex = sortableIds.indexOf(String(over.id))

    if (oldIndex === -1 || newIndex === -1) return

    const nextIds = [...sortableIds]
    const [moved] = nextIds.splice(oldIndex, 1)
    nextIds.splice(newIndex, 0, moved)

    props.onReorderIgIds(nextIds)
  }, [sortableIds, props])

  // Initialize preview carousel scroll state
  useEffect(() => {
    const el = previewCarouselRef.current
    if (!el) return
    const updateScrollState = () => {
      setCanScrollPreviewLeft(el.scrollLeft > 2)
      setCanScrollPreviewRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 2)
    }
    updateScrollState()
    const observer = new ResizeObserver(updateScrollState)
    observer.observe(el)
    return () => observer.disconnect()
  }, [featuredTiles])

  // Sync with parent cache if provided
  useEffect(() => {
    if (props.igOEmbedCache) {
      setIgOEmbedCache(props.igOEmbedCache)
    }
  }, [props.igOEmbedCache])

  // Note: oEmbed fetching removed - thumbnails now use pre-computed proxy URLs from item.thumbnailUrl
  // This eliminates 500 errors from failed oEmbed calls and makes thumbnails render immediately

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
  const brands = useMemo(
    () => normalizeStringArray(pastCollaborations ?? [], Number.POSITIVE_INFINITY),
    [pastCollaborations]
  )

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

  const hasFollowers = typeof followers === "number" && Number.isFinite(followers)
  const hasFollowing = typeof following === "number" && Number.isFinite(following)
  const hasPosts = typeof posts === "number" && Number.isFinite(posts)
  const showStatsRow = hasFollowers || hasFollowing || hasPosts

  const hasFollowersText = typeof followersText === "string" && followersText.trim().length > 0
  const hasPostsText = typeof postsText === "string" && postsText.trim().length > 0
  const hasEngagementRateText = typeof engagementRateText === "string" && engagementRateText.trim().length > 0

  const hasReach = typeof reachText === "string" && reachText.trim().length > 0
  const showKpiGrid = hasReach

  const sectionRing = (key: NonNullable<CreatorCardPreviewProps["highlightSection"]>) =>
    highlightSection === key ? "ring-2 ring-white/18" : ""

  const Photo = ({ url }: { url: string }) => {
    const [loaded, setLoaded] = useState(false)
    return (
      <>
        {!loaded ? <div className="absolute inset-0 animate-pulse bg-white/5" /> : null}
        <Image
          src={url}
          alt={resolvedDisplayName ? t("alt.avatar").replace("{name}", resolvedDisplayName) : ""}
          fill
          sizes="(max-width: 640px) 90vw, 400px"
          unoptimized
          className={"object-cover" + (!loaded ? " opacity-0" : " opacity-100")}
          onLoad={() => setLoaded(true)}
          onError={() => setLoaded(true)}
          referrerPolicy="no-referrer"
        />
      </>
    )
  }

  return (
    <div className="rounded-2xl border border-white/8 bg-[#0b1220]/40 backdrop-blur-sm">
      <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4 sm:p-5 lg:p-8 min-w-0">
        {/* Mobile Dating-App Style Layout (< sm breakpoint) */}
        <div className="sm:hidden">
          <MobileCreatorCardLayout
            t={t}
            locale={props.locale}
            profileImageUrl={effectivePhotoUrl}
            displayName={resolvedDisplayName}
            username={resolvedUsername}
            aboutText={bioText}
            primaryNiche={resolvedPrimaryNiche}
            audienceSummary={audienceSummaryText}
            collaborationNiches={nicheText}
            formats={formats.map((id) => ({ id, label: formatLabelMap[id] || id }))}
            brands={brands}
            contact={parsedContact}
            featuredItems={sortableIg}
            onOpenIg={setOpenIg}
          />
        </div>

        {/* Desktop/Tablet Layout (>= sm breakpoint) */}
        <div className="hidden sm:flex flex-col gap-5 sm:gap-6 min-w-0">
          {/* Header grid: avatar/name left, bio right */}
          <div className="grid grid-cols-1 sm:grid-cols-[minmax(160px,200px)_minmax(0,1fr)] gap-4 sm:gap-5 min-w-0">
            {/* Left: avatar/photo + name/handle */}
            <div className="min-w-0 sm:min-w-[160px]">
              <button
                type="button"
                onClick={() => effectivePhotoUrl && setOpenAvatarUrl(effectivePhotoUrl)}
                className="rounded-xl border border-white/10 bg-black/20 overflow-hidden min-w-0 w-full transition-opacity hover:opacity-80 cursor-pointer"
                disabled={!effectivePhotoUrl}
              >
                <div className="relative aspect-[3/4] w-full">
                  {effectivePhotoUrl ? (
                    <Photo key={effectivePhotoUrl} url={effectivePhotoUrl} />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center text-sm text-white/50">—</div>
                  )}
                </div>
              </button>

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
                    className="w-full rounded-md border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[11px] font-semibold text-white/75 transition-colors hover:bg-white/[0.05] hover:border-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/15"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    上傳照片
                  </button>
                </div>
              ) : null}

              <div className="mt-auto border-t border-white/5 pt-4 min-w-0">
                <div
                  title={resolvedDisplayName}
                  className="min-w-0 text-[clamp(18px,4.6vw,26px)] font-semibold text-white/90 leading-snug break-words line-clamp-2 [overflow-wrap:anywhere]"
                >
                  {resolvedDisplayName}
                </div>
                <div
                  title={`@${resolvedUsername}`}
                  className="mt-0.5 min-w-0 truncate text-xs sm:text-sm text-white/55 font-medium tracking-tight"
                >
                  @{resolvedUsername}
                </div>
              </div>
            </div>

            {/* Right: bio (only if exists) */}
            {bioText ? (
              <div className="min-w-0 w-full sm:max-w-[560px] rounded-2xl border border-white/10 bg-black/20 px-4 py-3 sm:py-4 overflow-hidden">
                <div className="text-[10px] tracking-widest font-semibold text-white/55 mb-2">
                  {t("results.mediaKit.about.title")}
                </div>
                <p className="text-sm leading-relaxed text-white/85 break-words [overflow-wrap:anywhere] whitespace-pre-wrap">
                  {bioText}
                </p>
              </div>
            ) : null}
          </div>

          {showStatsRow ? (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 min-w-0">
            <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 min-w-0">
              <div className="text-[11px] font-semibold text-white/55 whitespace-nowrap truncate">{t("results.mediaKit.stats.followers")}</div>
              <div className="mt-1 text-xl font-bold text-slate-100 tabular-nums whitespace-nowrap truncate">
                {hasFollowers ? followers.toLocaleString() : "—"}
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 min-w-0">
              <div className="text-[11px] font-semibold text-white/55 whitespace-nowrap truncate">{t("results.mediaKit.stats.following")}</div>
              <div className="mt-1 text-xl font-bold text-slate-100 tabular-nums whitespace-nowrap truncate">
                {hasFollowing ? following.toLocaleString() : "—"}
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 min-w-0">
              <div className="text-[11px] font-semibold text-white/55 whitespace-nowrap truncate">{t("results.mediaKit.stats.posts")}</div>
              <div className="mt-1 text-xl font-bold text-slate-100 tabular-nums whitespace-nowrap truncate">
                {hasPosts ? posts.toLocaleString() : "—"}
              </div>
            </div>
          </div>
        ) : null}

          <div id="creator-card-highlights" className="min-w-0">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold tracking-wide text-white/70">{t("results.mediaKit.highlights.title")}</div>
            <div className="mt-0.5 text-[11px] text-white/45">{t("results.mediaKit.highlights.subtitle")}</div>
            {featuredCount === 0 ? (
              <div className="mt-1.5 flex items-start gap-2">
                <Sparkles className="mt-[2px] h-4 w-4 text-white/40" aria-hidden="true" />
                <div className="min-w-0">
                  <div className="text-sm text-white/70">
                    {t("results.mediaKit.highlights.empty")}
                  </div>
                  <div className="mt-1 text-xs text-white/50">
                    {t("results.mediaKit.highlights.emptyHint")}
                  </div>
                  <button
                    type="button"
                    className="mt-2 inline-flex items-center rounded-lg border border-white/10 bg-white/[0.06] px-2.5 py-1.5 text-xs font-medium text-white/80 hover:bg-white/[0.09] active:bg-white/[0.12]"
                    onClick={() => {
                      const el = document.getElementById("creator-card-highlights")
                      el?.scrollIntoView({ behavior: "smooth", block: "start" })
                    }}
                  >
                    {t("results.mediaKit.highlights.cta")}
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          <div className="relative mt-3 min-w-0">
            {canScrollPreviewLeft && (
              <button
                type="button"
                onClick={() => {
                  const el = previewCarouselRef.current
                  if (!el) return
                  const firstItem = el.querySelector('button[data-preview-item]')
                  if (!firstItem) return
                  const cardWidth = firstItem.getBoundingClientRect().width
                  el.scrollBy({ left: -(cardWidth + 16), behavior: 'smooth' })
                }}
                className="absolute left-2 top-1/2 -translate-y-1/2 z-10 flex items-center justify-center w-11 h-11 rounded-full bg-black/70 backdrop-blur-sm text-white/90 hover:bg-black/85 transition-all shadow-lg"
                style={{ minWidth: "44px", minHeight: "44px" }}
                aria-label="Previous"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            )}
            {canScrollPreviewRight && (
              <button
                type="button"
                onClick={() => {
                  const el = previewCarouselRef.current
                  if (!el) return
                  const firstItem = el.querySelector('button[data-preview-item]')
                  if (!firstItem) return
                  const cardWidth = firstItem.getBoundingClientRect().width
                  el.scrollBy({ left: cardWidth + 16, behavior: 'smooth' })
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 z-10 flex items-center justify-center w-11 h-11 rounded-full bg-black/70 backdrop-blur-sm text-white/90 hover:bg-black/85 transition-all shadow-lg"
                style={{ minWidth: "44px", minHeight: "44px" }}
                aria-label="Next"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            )}
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={sortableIds} strategy={horizontalListSortingStrategy}>
                <div
                  ref={(el) => {
                    featuredStripRef.current = el
                    previewCarouselRef.current = el
                  }}
                  className="flex gap-4 overflow-x-auto min-w-0 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden px-10"
                  onScroll={() => {
                    const el = previewCarouselRef.current
                    if (!el) return
                    setCanScrollPreviewLeft(el.scrollLeft > 2)
                    setCanScrollPreviewRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 2)
                  }}
                >
                  {sortableIg.length === 0 ? (
                    <div className="shrink-0 w-[150px] md:w-[170px] aspect-[3/4] overflow-hidden rounded-2xl border border-white/10 bg-white/5">
                      <div className="h-full w-full flex items-center justify-center">
                        <Plus className="h-7 w-7 text-white/25" />
                      </div>
                    </div>
                  ) : (
                    sortableIg.map((item) => {
                    const normalizedUrl = normalizeUrl(item.url)
                    const retryKey = retryKeys[normalizedUrl] || 0
                    
                    // Use pre-computed thumbnailUrl from item (set by normalizeFeaturedItems in hook)
                    // This is already set to /api/ig/thumbnail?url=... for IG posts or direct URL for uploaded items
                    const thumbnailSrc = typeof item.thumbnailUrl === "string" ? item.thumbnailUrl : undefined
                    const caption = typeof item.caption === "string" ? item.caption : null
                    
                    return (
                      <SortablePreviewItem key={item.id} item={item} onItemClick={() => setOpenIg({ url: normalizedUrl, thumb: thumbnailSrc, caption })}>
                        <div
                          data-preview-item
                          className="relative shrink-0 w-[120px] md:w-[140px] overflow-hidden rounded-2xl border border-white/10 bg-slate-900/60 hover:bg-white/10 hover:border-white/20 transition-colors cursor-pointer"
                          style={{ aspectRatio: "4 / 5" }}
                        >
                        {thumbnailSrc && !thumbnailLoadErrors[normalizedUrl] ? (
                          <img
                            key={retryKey}
                            src={thumbnailSrc}
                            alt="Instagram post"
                            className="w-full h-full object-cover block"
                            loading="lazy"
                            referrerPolicy="no-referrer"
                            decoding="async"
                            onError={() => {
                              setThumbnailLoadErrors(prev => ({ ...prev, [normalizedUrl]: true }))
                              if (process.env.NODE_ENV !== "production") {
                                console.error("[Preview IG Thumbnail Load Failed]", { url: normalizedUrl, thumbnailSrc })
                              }
                            }}
                          />
                        ) : thumbnailSrc && thumbnailLoadErrors[normalizedUrl] ? (
                          <div className="relative w-full h-full flex flex-col items-center justify-center gap-2 p-2">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                setThumbnailLoadErrors(prev => ({ ...prev, [normalizedUrl]: false }))
                                setRetryKeys(prev => ({ ...prev, [normalizedUrl]: (prev[normalizedUrl] || 0) + 1 }))
                              }}
                              className="absolute top-1 right-1 p-1.5 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
                              style={{ minWidth: "44px", minHeight: "44px" }}
                              title="Retry loading thumbnail"
                            >
                              <svg className="w-4 h-4 text-white/70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                              </svg>
                            </button>
                            <svg className="w-8 h-8 text-white/30" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M7.8 2h8.4C19.4 2 22 4.6 22 7.8v8.4a5.8 5.8 0 0 1-5.8 5.8H7.8C4.6 22 2 19.4 2 16.2V7.8A5.8 5.8 0 0 1 7.8 2m-.2 2A3.6 3.6 0 0 0 4 7.6v8.8C4 18.39 5.61 20 7.6 20h8.8a3.6 3.6 0 0 0 3.6-3.6V7.6C20 5.61 18.39 4 16.4 4H7.6m9.65 1.5a1.25 1.25 0 0 1 1.25 1.25A1.25 1.25 0 0 1 17.25 8 1.25 1.25 0 0 1 16 6.75a1.25 1.25 0 0 1 1.25-1.25M12 7a5 5 0 0 1 5 5 5 5 0 0 1-5 5 5 5 0 0 1-5-5 5 5 0 0 1 5-5m0 2a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3z"/>
                            </svg>
                          </div>
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center gap-2 p-2">
                            <svg className="w-8 h-8 text-white/30" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M7.8 2h8.4C19.4 2 22 4.6 22 7.8v8.4a5.8 5.8 0 0 1-5.8 5.8H7.8C4.6 22 2 19.4 2 16.2V7.8A5.8 5.8 0 0 1 7.8 2m-.2 2A3.6 3.6 0 0 0 4 7.6v8.8C4 18.39 5.61 20 7.6 20h8.8a3.6 3.6 0 0 0 3.6-3.6V7.6C20 5.61 18.39 4 16.4 4H7.6m9.65 1.5a1.25 1.25 0 0 1 1.25 1.25A1.25 1.25 0 0 1 17.25 8 1.25 1.25 0 0 1 16 6.75a1.25 1.25 0 0 1 1.25-1.25M12 7a5 5 0 0 1 5 5 5 5 0 0 1-5 5 5 5 0 0 1-5-5 5 5 0 0 1 5-5m0 2a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3z"/>
                            </svg>
                          </div>
                        )}
                        </div>
                      </SortablePreviewItem>
                    )
                  })
                  )}
                </div>
              </SortableContext>
            </DndContext>

            {featuredCount > 1 && featuredHasOverflow ? (
              <>
                <button
                  type="button"
                  onClick={() => scrollFeaturedBy(-1)}
                  disabled={!canScrollFeaturedLeft}
                  className="pointer-events-auto absolute left-2 top-1/2 z-20 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/30 text-white/85 backdrop-blur hover:bg-black/40 disabled:opacity-30 disabled:pointer-events-none"
                  aria-label={t("aria.scrollLeft")}
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={() => scrollFeaturedBy(1)}
                  disabled={!canScrollFeaturedRight}
                  className="pointer-events-auto absolute right-2 top-1/2 z-20 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/30 text-white/85 backdrop-blur hover:bg-black/40 disabled:opacity-30 disabled:pointer-events-none"
                  aria-label={t("aria.scrollRight")}
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
            <div className={"rounded-xl border border-white/8 bg-black/20 px-3 py-2.5 min-w-0 transition-colors " + sectionRing("contact")}>
              <div className="text-[10px] tracking-widest font-semibold text-white/55">{t("results.mediaKit.contact.title")}</div>
              <div className="mt-2 flex flex-wrap gap-2">
                <Pill title={String(parsedContact.email || "")}>
                  {parsedContact.email ? parsedContact.email : t("results.mediaKit.contact.notProvided")}
                </Pill>
                <Pill title={String(parsedContact.other || "")}>
                  {parsedContact.other ? parsedContact.other : t("results.mediaKit.contact.notProvided")}
                </Pill>
              </div>
            </div>
          ) : null}
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2.5 min-w-0 md:min-h-[320px] lg:min-h-[360px] flex flex-col">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 min-w-0">
              <div className={"min-w-0 rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2.5 transition-colors " + sectionRing("primaryNiche")}>
                <div className="text-[10px] font-semibold text-white/55">{t("results.mediaKit.about.lines.primaryNiche")}</div>
                <div className="mt-0.5 min-w-0">
                  <Pill
                    clampLines={2}
                    title={String(resolvedPrimaryNiche ?? "")}
                    className="break-words whitespace-normal [overflow-wrap:anywhere] text-white/85"
                    unstyled
                  >
                    {resolvedPrimaryNiche}
                  </Pill>
                </div>
              </div>
              <div className={"min-w-0 rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2.5 transition-colors " + sectionRing("audienceSummary")}>
                <div className="text-[10px] font-semibold text-white/55">{t("results.mediaKit.about.lines.audienceSummary")}</div>
                <div className="mt-0.5 min-w-0">
                  <Pill
                    clampLines={2}
                    title={String(audienceSummaryText ?? "")}
                    className="break-words whitespace-normal [overflow-wrap:anywhere] text-white/85"
                    unstyled
                  >
                    {audienceSummaryText}
                  </Pill>
                </div>
              </div>
            </div>

            <div className={"mt-2 min-w-0 rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2.5 transition-colors " + nichesHighlight + " " + sectionRing("collaborationNiches")}>
              <div className="text-[10px] font-semibold text-white/55">{t("results.mediaKit.collaborationNiches.label")}</div>
              <div className="mt-0.5 min-w-0">
                <Pill clampLines={2} title={String(nicheText ?? "")} className="text-white/85" unstyled>
                  {nicheText}
                </Pill>
              </div>
            </div>

            <div className={"mt-2 min-w-0 rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2.5 transition-colors " + formatsHighlight + " " + sectionRing("formats")}>
              <div className="text-[10px] font-semibold text-white/55">{t("results.mediaKit.collaborationFormats.title")}</div>
              <div className="mt-2 flex flex-wrap gap-2 min-w-0">
                {formats.length === 0 ? (
                  <div className="text-[12px] leading-snug text-white/45">{t("results.mediaKit.collaborationFormats.empty")}</div>
                ) : (
                  <>
                    {formats.map((id) => (
                      <span
                        key={id}
                        className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-semibold text-white/75 min-w-0 max-w-[220px] truncate whitespace-nowrap transition-colors hover:bg-white/[0.05] hover:border-white/12"
                      >
                        {formatLabelMap[id] || id}
                      </span>
                    ))}
                  </>
                )}
              </div>
            </div>
          </div>

          {showKpiGrid ? (
          <div className="min-w-0">
            <div className="text-[11px] font-semibold tracking-wide text-white/70">{t("results.mediaKit.kpis.title")}</div>
            <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-2 min-w-0">
              {(
                [
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
        </div>
      </div>

      {/* Avatar Preview Modal */}
      {openAvatarUrl && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur z-50 flex items-center justify-center p-3 sm:p-6"
          onClick={() => setOpenAvatarUrl(null)}
          onWheelCapture={(e) => e.stopPropagation()}
        >
          <div
            className="w-[94vw] max-w-[560px] md:max-w-[720px] max-h-[90vh] rounded-2xl border border-white/10 bg-slate-900/95 backdrop-blur shadow-2xl flex flex-col mx-auto overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="shrink-0 flex items-center justify-between gap-3 px-4 py-3 border-b border-white/10">
              <h3 className="text-sm font-semibold text-white/90 break-words [overflow-wrap:anywhere] min-w-0">
                {t("results.mediaKit.about.title")}
              </h3>
              <button
                type="button"
                onClick={() => setOpenAvatarUrl(null)}
                className="shrink-0 rounded-full bg-white/10 p-2 hover:bg-white/20 transition-colors"
                aria-label="Close"
                style={{ minWidth: "44px", minHeight: "44px" }}
              >
                <X className="h-4 w-4 text-white/90" />
              </button>
            </div>
            <div className="flex-1 min-h-0 p-3 sm:p-4 md:p-5 overflow-hidden flex items-center justify-center">
              <div className="w-full h-full max-h-[80vh] flex items-center justify-center">
                <img
                  src={openAvatarUrl}
                  alt={resolvedDisplayName || "Profile"}
                  className="max-w-full max-h-full object-contain rounded-lg"
                  referrerPolicy="no-referrer"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* IG Post Preview Modal - Image Only */}
      {openIg && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur flex items-center justify-center p-3 sm:p-4" onClick={() => setOpenIg(null)}>
          <div 
            className="w-full max-w-[520px] max-h-[90vh] rounded-2xl border border-white/10 bg-[#0b1220]/80 backdrop-blur flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header - non-scrolling */}
            <div className="shrink-0 flex items-center justify-between gap-3 px-4 py-3 border-b border-white/10">
              <div className="text-sm font-semibold text-white/85 min-w-0 break-words [overflow-wrap:anywhere]">
                {t("creatorCard.featured.igPreviewTitle")}
              </div>
              <button
                type="button"
                onClick={() => setOpenIg(null)}
                className="h-9 w-9 shrink-0 rounded-full border border-white/10 bg-white/5 text-white/80 hover:bg-white/10"
                aria-label="Close"
                style={{ minWidth: "36px", minHeight: "36px" }}
              >
                ×
              </button>
            </div>

            {/* Body - scrollable container */}
            <div 
              ref={igModalBodyRef}
              className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-4 py-4"
              style={{
                overflowAnchor: "none",
                overscrollBehavior: "contain",
                WebkitOverflowScrolling: "touch"
              }}
            >
              <div className="rounded-xl border border-white/10 bg-black/20 overflow-hidden">
                <div className="flex items-center justify-center p-2">
                  {openIg.thumb ? (
                    <img
                      src={openIg.thumb}
                      alt="Instagram post"
                      className="max-h-[70vh] w-full object-contain"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="py-10 text-center text-sm text-white/50">
                      Preview unavailable
                    </div>
                  )}
                </div>
              </div>

              {/* Caption Section */}
              {openIg.caption !== undefined && (
                <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3">
                  <div className="text-xs font-semibold text-white/60 mb-2">
                    {t("creatorCard.featured.caption")}
                  </div>
                  {openIg.caption ? (
                    <div className="text-sm text-white/85 whitespace-pre-wrap break-words [overflow-wrap:anywhere] leading-relaxed max-h-[200px] overflow-y-auto">
                      {openIg.caption}
                    </div>
                  ) : (
                    <div className="text-sm text-white/50 italic">
                      {t("creatorCard.featured.noCaption")}
                    </div>
                  )}
                </div>
              )}

              <a
                href={openIg.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#6d28d9] to-[#db2777] px-4 py-3 text-sm font-semibold text-white hover:brightness-110 min-w-0"
                style={{ minHeight: "44px" }}
              >
                <span className="min-w-0 break-words [overflow-wrap:anywhere]">
                  {t("creatorCard.featured.openOnInstagram")}
                </span>
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export function CreatorCardPreview(props: CreatorCardPreviewProps) {
  const { t, id, className, headerClassName, actions } = props

  return (
    <Card id={id} className={"min-w-0 " + (className ?? "")}>
      <CardHeader className={headerClassName}>
        <div className="w-full flex flex-wrap items-center gap-2">
          <div className="min-w-0">
            <CardTitle className="text-base sm:text-xl font-bold text-white min-w-0 truncate leading-snug sm:leading-tight">{t("results.creatorCardPreview.title")}</CardTitle>
            <p className="mt-0.5 text-[10px] sm:text-sm text-slate-400 leading-snug min-w-0 truncate">{t("results.creatorCardPreview.subtitle")}</p>
          </div>
          {actions ? <div className="ml-auto flex flex-wrap items-center justify-end gap-2">{actions}</div> : null}
        </div>
      </CardHeader>

      <CardContent className="p-3 sm:p-4 lg:p-6">
        <CreatorCardPreviewCard {...props} />
      </CardContent>
    </Card>
  )
}
