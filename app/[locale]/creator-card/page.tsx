"use client"

// NOTE: Save blocked only during uploads (featuredUploadingIds > 0); failed uploads marked but don't block save

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Image from "next/image"
import { ChevronDown, Eye, Loader2, Plus, X } from "lucide-react"
import { createPortal } from "react-dom"

import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from "@dnd-kit/core"
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"

import { useI18n } from "../../../components/locale-provider"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Button } from "../../../components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "../../../components/ui/card"
import { Input } from "../../../components/ui/input"
import { extractLocaleFromPathname } from "../../lib/locale-path"
import { CreatorCardPreview } from "../../components/CreatorCardPreview"
import { useInstagramMe } from "../../lib/useInstagramMe"
import { COLLAB_TYPE_OPTIONS, COLLAB_TYPE_OTHER_VALUE, collabTypeLabelKey, type CollabTypeOptionId } from "../../lib/creatorCardOptions"

// Strict oEmbed types
type OEmbedStatus = "idle" | "loading" | "success" | "error"

type OEmbedSuccess = {
  ok: true
  thumbnailUrl?: string
  title?: string
  source?: "oembed" | "og"
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

function useIsMobileMax640() {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    if (typeof window === "undefined") return
    const mq = window.matchMedia("(max-width: 640px)")

    const apply = () => setIsMobile(Boolean(mq.matches))
    apply()

    const onChange = () => apply()
    if (typeof mq.addEventListener === "function") {
      mq.addEventListener("change", onChange)
      return () => mq.removeEventListener("change", onChange)
    }

    mq.addListener(onChange)
    return () => mq.removeListener(onChange)
  }, [])

  return isMobile
}

type CreatorStats = {
  engagementRatePct?: number
}

type InstagramProfileLite = {
  username?: string
  name?: string
  display_name?: string
  displayName?: string
  profile_picture_url?: string
  followers_count?: number
  media_count?: number
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null
  return value as Record<string, unknown>
}

function readString(value: unknown): string | null {
  return typeof value === "string" ? value : null
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

type CreatorCardMeResponse = {
  ok: boolean
  card?: unknown
  me?: unknown
  error?: unknown
}

type CreatorStatsResponse = {
  ok: boolean
  stats?: unknown
}

type CreatorCardUpsertResponse = {
  ok: boolean
  card?: unknown
  error?: unknown
  message?: unknown
}

type CreatorCardPortfolioItem = {
  id: string
  brand: string
  collabType: string
  order: number
}

type CreatorCardUpsertPayload = {
  handle?: string
  displayName?: string
  profileImageUrl?: string
  niche?: string
  audience?: string
  themeTypes?: string[]
  audienceProfiles?: string[]
  contact?: string | null
  portfolio?: CreatorCardPortfolioItem[]
  isPublic?: boolean
  deliverables?: string[]
  collaborationNiches?: string[]
  pastCollaborations?: string[]
}

type CreatorCardPayload = {
  handle?: string | null
  displayName?: string | null
  profileImageUrl?: string | null
  niche?: string | null
  audience?: string | null
  themeTypes?: string[] | null
  audienceProfiles?: string[] | null
  deliverables?: string[] | null
  contact?: string | null
  portfolio?: unknown[] | null
  isPublic?: boolean | null
  collaborationNiches?: string[] | null
  pastCollaborations?: string[] | null
}

type FeaturedItem = {
  id: string
  url: string
  brand: string
  collabType: string
  uploadStatus?: "idle" | "uploading" | "failed"
  caption?: string
  type?: "media" | "text" | "ig"
  title?: string
  text?: string
  isAdded?: boolean
}

function IgEmbedPreview({ url }: { url: string }) {
  const embedRef = useRef<HTMLDivElement>(null)
  const [embedLoaded, setEmbedLoaded] = useState(false)

  useEffect(() => {
    // Load Instagram embed script once
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

    // Add global CSS for responsive embed
    if (!document.getElementById('ig-embed-fix')) {
      const style = document.createElement('style')
      style.id = 'ig-embed-fix'
      style.textContent = `
        .instagram-media {
          width: 100% !important;
          max-width: 100% !important;
          min-width: 326px !important;
        }
        iframe.instagram-media-rendered {
          width: 100% !important;
        }
      `
      document.head.appendChild(style)
    }
  }, [])

  useEffect(() => {
    if (embedLoaded && window.instgrm?.Embeds) {
      const process = () => {
        if (window.instgrm?.Embeds) {
          window.instgrm.Embeds.process()
        }
      }
      
      // Multiple process calls to handle timing issues
      requestAnimationFrame(process)
      setTimeout(process, 250)
      setTimeout(process, 1000)
    }
  }, [url, embedLoaded])

  return (
    <div ref={embedRef} className="w-full max-w-full overflow-hidden rounded-lg">
      <blockquote
        className="instagram-media"
        data-instgrm-permalink={url}
        data-instgrm-version="14"
        style={{ maxWidth: "100%", minWidth: "326px" }}
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

function SortableFeaturedTile(props: {
  item: FeaturedItem
  t: (key: string) => string
  onReplace: (id: string) => void
  onRemove: (id: string) => void
  onEdit: (id: string) => void
  onCaptionChange: (id: string, caption: string) => void
  onTextChange: (id: string, text: string, title?: string) => void
  onIgUrlChange: (id: string, url: string) => void
  onIgThumbnailClick?: (url: string) => void
  igOEmbedCache: Record<string, OEmbedState>
  onIgOEmbedFetch: (url: string, data: OEmbedState) => void
  setFeaturedItems: React.Dispatch<React.SetStateAction<FeaturedItem[]>>
  markDirty: () => void
  suppressClick: boolean
  activeLocale: "zh-TW" | "en"
}) {
  const { item, t, onReplace, onRemove, onEdit, onCaptionChange, onTextChange, onIgUrlChange, setFeaturedItems, markDirty, suppressClick } = props
  const { attributes, listeners, setNodeRef, transform, transition, isDragging, isOver } = useSortable({ id: item.id })

  const itemType = item.type || "media"

  const featuredChipText = (() => {
    const rawType = typeof item.collabType === "string" ? item.collabType : ""
    if (!rawType.trim()) return t("creatorCardEditor.common.select")
    return getCollabTypeDisplayLabel(rawType, t)
  })()

  const featuredChipTitle = (() => {
    const rawType = typeof item.collabType === "string" ? item.collabType : ""
    return getCollabTypeDisplayLabel(rawType, t)
  })()

  // Text item rendering
  if (itemType === "text") {
    return (
      <div
        ref={setNodeRef}
        style={{ transform: CSS.Transform.toString(transform), transition }}
        className={
          "group relative w-full min-h-[200px] p-4 rounded-lg border border-white/10 bg-white/5 shadow-sm transition-colors space-y-3 " +
          (isDragging ? "scale-[1.04] shadow-xl ring-2 ring-white/30 opacity-95" : "hover:border-white/20 hover:bg-white/10") +
          (!isDragging && isOver ? " ring-2 ring-emerald-400/50" : "") +
          (isDragging ? " cursor-grabbing" : " cursor-grab")
        }
        {...attributes}
        {...listeners}
      >
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-semibold text-white/60">{t("creatorCard.featured.textItem")}</span>
        </div>

        <input
          type="text"
          value={item.title || ""}
          onChange={(e) => onTextChange(item.id, item.text || "", e.target.value)}
          placeholder={t("creatorCard.featured.textTitle")}
          className="w-full px-3 py-2 text-sm font-semibold bg-slate-950/40 border border-white/10 rounded-lg text-slate-100 placeholder:text-slate-400 focus-visible:ring-1 focus-visible:ring-white/20 focus:outline-none"
          onPointerDown={(e) => e.stopPropagation()}
        />

        <textarea
          value={item.text || ""}
          onChange={(e) => onTextChange(item.id, e.target.value, item.title)}
          placeholder={t("creatorCard.featured.textContent")}
          className="w-full min-h-[120px] px-3 py-2 text-sm bg-slate-950/40 border border-white/10 rounded-lg text-slate-100 placeholder:text-slate-400 focus-visible:ring-1 focus-visible:ring-white/20 focus:outline-none resize-y"
          rows={5}
          onPointerDown={(e) => e.stopPropagation()}
        />

        <button
          type="button"
          className="absolute right-2 top-2 z-10 rounded-full bg-white/90 p-1 shadow-sm hover:bg-white"
          onPointerDownCapture={(e) => {
            e.preventDefault()
            e.stopPropagation()
          }}
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onRemove(item.id)
          }}
          aria-label="移除"
        >
          <X className="h-3.5 w-3.5 text-slate-700" />
        </button>
      </div>
    )
  }

  // IG item rendering
  if (itemType === "ig") {
    // Normalize URL for consistent cache keys (remove trailing slash)
    const normalizedUrl = item.url ? item.url.trim().replace(/\/$/, "") : ""
    const isValidIgUrl = normalizedUrl && (normalizedUrl.includes("instagram.com/p/") || normalizedUrl.includes("instagram.com/reel/") || normalizedUrl.includes("instagram.com/tv/"))
    const isAdded = item.isAdded ?? false
    const oembedData = props.igOEmbedCache[normalizedUrl]
    const debounceRef = useRef<number | null>(null)
    const [thumbnailLoadError, setThumbnailLoadError] = useState(false)
    const [retryKey, setRetryKey] = useState(0)
    
    // Generate direct media URL (always available, no oEmbed required)
    const directMediaUrl = isValidIgUrl ? buildInstagramDirectMediaUrl(normalizedUrl) : null
    
    // Reset thumbnail error when URL changes
    useEffect(() => {
      setThumbnailLoadError(false)
      setRetryKey(0)
    }, [normalizedUrl])
    
    // Fetch oEmbed data for thumbnail using strict fetch
    const fetchOEmbed = useCallback(async () => {
      if (!isValidIgUrl || !normalizedUrl) return
      
      // Set loading state
      props.onIgOEmbedFetch(normalizedUrl, {
        status: "loading",
      })
      
      try {
        const response = await fetchOEmbedStrict(normalizedUrl)
        
        if (response.ok === false) {
          // Error response
          props.onIgOEmbedFetch(normalizedUrl, {
            status: "error",
            httpStatus: response.error?.status,
            errorMessage: response.error?.message ?? "Preview unavailable",
          })
          if (process.env.NODE_ENV !== "production") {
            console.error("[IG oEmbed Error]", { url: normalizedUrl, error: response.error })
          }
        } else {
          // Success response
          props.onIgOEmbedFetch(normalizedUrl, {
            status: "success",
            data: response,
          })
          if (process.env.NODE_ENV !== "production") {
            console.log("[IG oEmbed Success]", { url: normalizedUrl, thumbnail: response.data?.thumbnail_url })
          }
        }
      } catch (e: any) {
        // Should not happen with fetchOEmbedStrict, but handle just in case
        props.onIgOEmbedFetch(normalizedUrl, {
          status: "error",
          errorMessage: e?.message ?? "Network error",
        })
        if (process.env.NODE_ENV !== "production") {
          console.error("[IG oEmbed Exception]", { url: normalizedUrl, error: e })
        }
      }
    }, [normalizedUrl, isValidIgUrl, props])
    
    useEffect(() => {
      if (!normalizedUrl) return
      if (!isValidIgUrl) return

      // If we already have success/error for this URL, don't refetch automatically
      const st = props.igOEmbedCache[normalizedUrl]?.status
      if (st === "success" || st === "error" || st === "loading") return

      if (debounceRef.current) window.clearTimeout(debounceRef.current)
      debounceRef.current = window.setTimeout(() => {
        fetchOEmbed()
      }, 600)

      return () => {
        if (debounceRef.current) window.clearTimeout(debounceRef.current)
      }
    }, [normalizedUrl, isValidIgUrl, fetchOEmbed])
    
    return (
      <div
        ref={setNodeRef}
        style={{ transform: CSS.Transform.toString(transform), transition }}
        className={
          "group relative w-full p-4 rounded-xl border border-white/10 bg-white/5 shadow-sm transition-colors space-y-4 " +
          (isDragging ? "scale-[1.02] shadow-xl ring-2 ring-white/30 opacity-95" : "hover:border-white/20 hover:bg-white/10") +
          (!isDragging && isOver ? " ring-2 ring-emerald-400/50" : "")
        }
        {...attributes}
        {...listeners}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-white/60">{t("creatorCard.featured.igItem")}</span>
          <button
            type="button"
            className="shrink-0 rounded-full bg-white/90 p-1 shadow-sm hover:bg-white"
            onPointerDownCapture={(e) => {
              e.preventDefault()
              e.stopPropagation()
            }}
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onRemove(item.id)
            }}
            aria-label="移除"
          >
            <X className="h-3.5 w-3.5 text-slate-700" />
          </button>
        </div>

        {/* Show URL input only if not added yet */}
        {!isAdded && (
          <>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-white/70">{t("creatorCard.featured.igUrlLabel")}</label>
              <input
                type="url"
                value={item.url || ""}
                onChange={(e) => onIgUrlChange(item.id, e.target.value)}
                placeholder={t("creatorCard.featured.igUrl")}
                className="w-full px-3 py-2 text-sm bg-slate-950/40 border border-white/10 rounded-lg text-slate-100 placeholder:text-slate-400 focus-visible:ring-1 focus-visible:ring-white/20 focus:outline-none"
                onPointerDown={(e) => e.stopPropagation()}
              />
            </div>
            
            <a
              href="https://www.instagram.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white/80 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 hover:border-white/20 transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              <span>{t("creatorCard.featured.openInstagram")}</span>
            </a>
          </>
        )}

        {/* Dev diagnostics */}
        {process.env.NODE_ENV !== "production" && isValidIgUrl && (() => {
          const thumbnailUrl = oembedData?.status === "success" && oembedData.data.ok === true 
            ? (oembedData.data.thumbnailUrl || oembedData.data.data?.thumbnail_url)
            : undefined
          const errorMsg = oembedData?.status === "error" ? oembedData.errorMessage : undefined
          console.log("[IG Tile Render]", {
            url: normalizedUrl,
            status: oembedData?.status,
            hasThumbnail: !!thumbnailUrl,
            thumbnailLoadError,
            error: errorMsg,
            source: oembedData?.status === "success" ? oembedData.data.source : undefined,
          })
          return null
        })()}

        {/* Show loading skeleton while fetching oEmbed */}
        {normalizedUrl && isValidIgUrl && oembedData?.status === "loading" ? (
          <a
            href={normalizedUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block relative w-full overflow-hidden rounded-xl border border-white/10 bg-slate-900/60 hover:border-white/20 transition-colors cursor-pointer"
            style={{ aspectRatio: "4 / 5", maxHeight: "260px", pointerEvents: 'auto' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-full h-full flex flex-col items-center justify-center gap-3 p-6 animate-pulse">
              <div className="h-12 w-12 rounded-full bg-white/10" />
              <div className="h-3 w-24 rounded bg-white/10" />
            </div>
          </a>
        ) : normalizedUrl && isValidIgUrl && oembedData?.status === "error" ? (
          <a
            href={normalizedUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block relative w-full overflow-hidden rounded-xl border border-white/10 bg-slate-900/60 hover:border-white/20 transition-colors cursor-pointer flex flex-col items-center justify-center gap-3 p-6 text-center"
            style={{ aspectRatio: "4 / 5", maxHeight: "260px", pointerEvents: 'auto' }}
            onClick={(e) => e.stopPropagation()}
          >
            <svg className="w-10 h-10 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
            <span className="text-xs leading-tight text-white/60 break-words">
              {t("results.mediaKit.featured.previewUnavailable")}
            </span>
            <span className="text-[11px] leading-tight text-white/40 break-words">
              {t("results.mediaKit.featured.tapToOpen")}
            </span>
          </a>
        ) : normalizedUrl && isValidIgUrl && oembedData?.status === "success" && oembedData.data.ok === true && (oembedData.data.thumbnailUrl || oembedData.data.data?.thumbnail_url) ? (
          <a
            href={normalizedUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block relative w-full overflow-hidden rounded-xl border border-white/10 bg-slate-900/60 hover:border-white/20 transition-colors cursor-pointer"
            style={{ aspectRatio: "4 / 5", maxHeight: "260px", pointerEvents: 'auto' }}
            onClick={(e) => e.stopPropagation()}
          >
            {!thumbnailLoadError ? (
              <img
                key={retryKey}
                src={oembedData.data.thumbnailUrl || oembedData.data.data?.thumbnail_url || ""}
                alt="Instagram post thumbnail"
                className="w-full h-full object-cover block"
                loading="lazy"
                referrerPolicy="no-referrer"
                decoding="async"
                onError={() => {
                  setThumbnailLoadError(true)
                  if (process.env.NODE_ENV !== "production") {
                    console.error("[IG Thumbnail Load Failed]", { url: normalizedUrl, thumbnailUrl: oembedData.data.thumbnailUrl })
                  }
                }}
              />
            ) : (
              <div className="relative w-full h-full flex flex-col items-center justify-center gap-3 p-6">
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    setThumbnailLoadError(false)
                    setRetryKey(prev => prev + 1)
                  }}
                  className="absolute top-2 right-2 p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors z-10"
                  style={{ minWidth: "44px", minHeight: "44px" }}
                  title="Retry loading thumbnail"
                >
                  <svg className="w-5 h-5 text-white/70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>
                <div className="w-full h-full flex flex-col items-center justify-center gap-3 p-6">
                  <svg className="w-12 h-12 text-white/30" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M7.8 2h8.4C19.4 2 22 4.6 22 7.8v8.4a5.8 5.8 0 0 1-5.8 5.8H7.8C4.6 22 2 19.4 2 16.2V7.8A5.8 5.8 0 0 1 7.8 2m-.2 2A3.6 3.6 0 0 0 4 7.6v8.8C4 18.39 5.61 20 7.6 20h8.8a3.6 3.6 0 0 0 3.6-3.6V7.6C20 5.61 18.39 4 16.4 4H7.6m9.65 1.5a1.25 1.25 0 0 1 1.25 1.25A1.25 1.25 0 0 1 17.25 8 1.25 1.25 0 0 1 16 6.75a1.25 1.25 0 0 1 1.25-1.25M12 7a5 5 0 0 1 5 5 5 5 0 0 1-5 5 5 5 0 0 1-5-5 5 5 0 0 1 5-5m0 2a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3z"/>
                  </svg>
                  <div className="text-xs text-center text-white/60 leading-tight">{t("creatorCard.featured.previewUnavailable")}</div>
                </div>
              </div>
            )}
          </a>
        ) : normalizedUrl && isValidIgUrl ? (
          <a
            href={normalizedUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block relative w-full rounded-xl border border-white/10 bg-slate-800/50 hover:border-white/20 transition-colors cursor-pointer flex flex-col items-center justify-center gap-3 p-6"
            style={{ aspectRatio: "4 / 5", maxHeight: "260px", pointerEvents: 'auto' }}
            onClick={(e) => e.stopPropagation()}
          >
            <svg className="w-12 h-12 text-white/30" fill="currentColor" viewBox="0 0 24 24">
              <path d="M7.8 2h8.4C19.4 2 22 4.6 22 7.8v8.4a5.8 5.8 0 0 1-5.8 5.8H7.8C4.6 22 2 19.4 2 16.2V7.8A5.8 5.8 0 0 1 7.8 2m-.2 2A3.6 3.6 0 0 0 4 7.6v8.8C4 18.39 5.61 20 7.6 20h8.8a3.6 3.6 0 0 0 3.6-3.6V7.6C20 5.61 18.39 4 16.4 4H7.6m9.65 1.5a1.25 1.25 0 0 1 1.25 1.25A1.25 1.25 0 0 1 17.25 8 1.25 1.25 0 0 1 16 6.75a1.25 1.25 0 0 1 1.25-1.25M12 7a5 5 0 0 1 5 5 5 5 0 0 1-5 5 5 5 0 0 1-5-5 5 5 0 0 1 5-5m0 2a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3z"/>
            </svg>
            <div className="text-xs text-center text-white/60 leading-tight">{t("creatorCard.featured.previewUnavailable")}</div>
          </a>
        ) : null}
        
        {/* Add Post button - only show if not added and has valid URL */}
        {!isAdded && item.url && isValidIgUrl && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setFeaturedItems((prev) => prev.map((x) => (x.id === item.id ? { ...x, isAdded: true } : x)))
              markDirty()
            }}
            className="w-full px-4 py-3 text-sm font-semibold text-white bg-gradient-to-r from-purple-500/30 to-pink-500/30 border border-white/20 rounded-lg hover:from-purple-500/40 hover:to-pink-500/40 transition-colors"
          >
            {t("creatorCard.featured.addPost")}
          </button>
        )}
        
        {/* Added state indicator */}
        {isAdded && (
          <div className="text-xs font-semibold text-emerald-400/80">
            ✓ {t("creatorCard.featured.added")}
          </div>
        )}
      </div>
    )
  }

  // Media item rendering (default)
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={
        "group relative w-full flex flex-col md:flex-row gap-3 p-3 rounded-lg border border-white/10 bg-white/5 shadow-sm transition-colors " +
        (isDragging ? "scale-[1.04] shadow-xl ring-2 ring-white/30 opacity-95" : "hover:border-white/20 hover:bg-white/10") +
        (!isDragging && isOver ? " ring-2 ring-emerald-400/50" : "") +
        (isDragging ? " cursor-grabbing" : " cursor-grab")
      }
      {...attributes}
      {...listeners}
    >
      {/* Thumbnail */}
      <div className="relative w-full md:w-48 aspect-[3/4] shrink-0 overflow-hidden rounded-lg border border-white/10 bg-white/5">
        <button
          type="button"
          className={
            "absolute inset-0 z-0 " +
            (!item.url
              ? "flex flex-col items-center justify-center gap-1 text-slate-600"
              : "")
          }
          onClick={() => {
            if (suppressClick) return
            onReplace(item.id)
          }}
          aria-label={item.url ? "更換" : "請選擇"}
        >
          {!item.url ? (
            <span className="pointer-events-none flex flex-col items-center justify-center">
              <span className="text-sm font-semibold">請選擇</span>
              <span className="text-[11px] leading-4 text-slate-500">Choose</span>
            </span>
          ) : null}
        </button>

        {item.url ? (
          <Image src={item.url} alt="" fill sizes="100vw" unoptimized className="object-cover" />
        ) : (
          <div className="h-full w-full flex items-center justify-center bg-white/5">
            <Plus className="h-7 w-7 text-white/25" />
          </div>
        )}

        {item.url ? (
          <div
            className={
              "pointer-events-none absolute inset-0 bg-black/35 transition-opacity " +
              (isDragging ? "opacity-0" : "opacity-35 group-hover:opacity-0")
            }
          />
        ) : null}

        {item.url ? (
          <button
            type="button"
            className="absolute left-1 top-1 z-10 rounded-md bg-white/90 px-2 py-1 shadow-sm hover:bg-white"
            aria-label={featuredChipText}
            title={featuredChipTitle}
            onPointerDownCapture={(e) => {
              e.preventDefault()
              e.stopPropagation()
            }}
            onPointerDown={(e) => {
              e.preventDefault()
              e.stopPropagation()
            }}
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onEdit(item.id)
            }}
          >
            <span className="block min-w-0 max-w-full truncate text-[11px] font-semibold text-slate-700">
              {featuredChipText}
            </span>
          </button>
        ) : null}

        {item.uploadStatus === "failed" ? (
          <div className="absolute bottom-1 left-1 right-1 z-10 rounded-md bg-red-500/90 px-2 py-1 text-center shadow-sm">
            <span className="block text-[11px] font-semibold text-white">
              {t("creatorCard.form.featured.uploadFailed")}
            </span>
          </div>
        ) : null}

      </div>

      {/* Caption textarea - right side on desktop, below on mobile */}
      <div className="flex-1 flex flex-col gap-2">
        <textarea
          value={item.caption || ""}
          onChange={(e) => onCaptionChange(item.id, e.target.value)}
          placeholder={t("creatorCard.featured.caption")}
          className="w-full min-h-[80px] md:min-h-[120px] px-3 py-2 text-sm bg-slate-950/40 border border-white/10 rounded-lg text-slate-100 placeholder:text-slate-400 focus-visible:ring-1 focus-visible:ring-white/20 focus:outline-none resize-y"
          rows={3}
          onPointerDown={(e) => e.stopPropagation()}
        />
      </div>

      {/* Remove button - absolute positioned on parent */}
      <button
        type="button"
        className="absolute right-2 top-2 z-10 rounded-full bg-white/90 p-1 shadow-sm hover:bg-white"
        onPointerDownCapture={(e) => {
          e.preventDefault()
          e.stopPropagation()
        }}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          onRemove(item.id)
        }}
        aria-label="移除"
      >
        <X className="h-3.5 w-3.5 text-slate-700" />
      </button>
    </div>
  )
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

function getCollabTypeDisplayLabel(collabType: string, t: (key: string) => string): string {
  const raw = collabType.trim()
  if (!raw) return ""
  
  const normalized = raw.toLowerCase()
  
  // Check if it's a known collab type option (case-insensitive)
  if (COLLAB_TYPE_OPTIONS.includes(normalized as CollabTypeOptionId)) {
    return t(collabTypeLabelKey(normalized as CollabTypeOptionId))
  }
  
  // Custom value - return as-is
  return raw
}

function toggleInArray(values: string[], value: string) {
  const idx = values.indexOf(value)
  if (idx >= 0) return [...values.slice(0, idx), ...values.slice(idx + 1)]
  return [...values, value]
}

function selectedSummary(labels: string[], locale: string, t: (k: string) => string): { text: string; title: string } {
  const joiner = locale === "zh-TW" ? "、" : ", "
  const safe = labels.map((x) => (typeof x === "string" ? x.trim() : "")).filter(Boolean)
  if (safe.length === 0) {
    return { text: t("creatorCardEditor.common.select"), title: "" }
  }
  const title = safe.join(joiner)
  if (safe.length === 1) return { text: safe[0], title: safe[0] }
  return { text: `${safe[0]} +${safe.length - 1}`, title }
}

function useTwoRowChipOverflow(items: string[]) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const chipRefs = useRef<Record<string, HTMLElement | null>>({})
  const [expanded, setExpanded] = useState(false)
  const [hiddenCount, setHiddenCount] = useState(0)
  const [canToggle, setCanToggle] = useState(false)

  const recompute = useCallback(() => {
    const container = containerRef.current
    if (!container) {
      setHiddenCount(0)
      setCanToggle(false)
      return
    }

    const els = items.map((k) => chipRefs.current[k]).filter((x): x is HTMLElement => Boolean(x))
    if (els.length === 0) {
      setHiddenCount(0)
      setCanToggle(false)
      return
    }

    const tops = Array.from(new Set(els.map((el) => Math.round(el.offsetTop)))).sort((a, b) => a - b)
    if (tops.length <= 2) {
      setHiddenCount(0)
      setCanToggle(container.scrollHeight > 64 + 1)
      return
    }

    const allowedTop = tops[1]
    const count = els.reduce((acc, el) => (Math.round(el.offsetTop) > allowedTop ? acc + 1 : acc), 0)
    setHiddenCount(count)
    setCanToggle(count > 0 || container.scrollHeight > 64 + 1)
  }, [items])

  useEffect(() => {
    const raf = window.requestAnimationFrame(() => recompute())
    return () => window.cancelAnimationFrame(raf)
  }, [recompute, expanded])

  useEffect(() => {
    if (expanded) return
    const onResize = () => recompute()
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [expanded, recompute])

  return {
    containerRef,
    setChipRef: (key: string) => (node: HTMLElement | null) => {
      chipRefs.current[key] = node
    },
    expanded,
    setExpanded,
    hiddenCount,
    canToggle,
  }
}

export default function CreatorCardPage() {
  const { t } = useI18n()
  const router = useRouter()
  const searchParams = useSearchParams()
  const returnTo = searchParams.get("returnTo")

  const isMobile = useIsMobileMax640()
  const [mobilePreviewOpen, setMobilePreviewOpen] = useState(false)
  const mobilePreviewTriggerRef = useRef<HTMLElement | null>(null)
  const mobilePreviewModalRef = useRef<HTMLDivElement | null>(null)
  const [mobileShowThemeAdd, setMobileShowThemeAdd] = useState(false)
  const [mobileShowAudienceAdd, setMobileShowAudienceAdd] = useState(false)
  const mobileThemeInputRef = useRef<HTMLInputElement | null>(null)
  const mobileAudienceInputRef = useRef<HTMLInputElement | null>(null)

  const knownFormatIds = useMemo(
    () =>
      new Set([...COLLAB_TYPE_OPTIONS, "fb", "facebook", "other"]),
    [],
  )

  const knownCollabTypeIds = useMemo(() => new Set<string>(COLLAB_TYPE_OPTIONS as unknown as string[]), [])

  const [refetchTick, setRefetchTick] = useState(0)
  const [creatorId, setCreatorId] = useState<string | null>(null)
  const [creatorStats, setCreatorStats] = useState<CreatorStats | null>(null)
  
  // Featured carousel scroll state
  const featuredCarouselRef = useRef<HTMLDivElement>(null)
  const [canScrollFeaturedLeft, setCanScrollFeaturedLeft] = useState(false)
  const [canScrollFeaturedRight, setCanScrollFeaturedRight] = useState(false)

  const [toast, setToast] = useState<string | null>(null)
  const toastTimerRef = useRef<number | null>(null)
  const showToast = useCallback((message: string, durationMs?: number) => {
    setToast(message)
    if (toastTimerRef.current != null) window.clearTimeout(toastTimerRef.current)
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null)
      toastTimerRef.current = null
    }, typeof durationMs === "number" && Number.isFinite(durationMs) ? durationMs : 1800)
  }, [])

  const hasLoadedRef = useRef(false)
  const postSaveSyncRef = useRef(false)

  const activeLocale = useMemo(() => {
    if (typeof window === "undefined") return "en"
    return extractLocaleFromPathname(window.location.pathname).locale ?? "en"
  }, [])

  const formatOptions = useMemo(
    () =>
      ([
        ...COLLAB_TYPE_OPTIONS.map((id) => ({ id, labelKey: collabTypeLabelKey(id) })),
        { id: "other", labelKey: "creatorCardEditor.formats.options.other" },
      ] as const),
    []
  )

  const nicheOptions = useMemo(
    () =>
      [
        { id: "beauty", labelKey: "creatorCardEditor.niches.options.beauty" },
        { id: "fashion", labelKey: "creatorCardEditor.niches.options.fashion" },
        { id: "food", labelKey: "creatorCardEditor.niches.options.food" },
        { id: "travel", labelKey: "creatorCardEditor.niches.options.travel" },
        { id: "parenting", labelKey: "creatorCardEditor.niches.options.parenting" },
        { id: "fitness", labelKey: "creatorCardEditor.niches.options.fitness" },
        { id: "tech", labelKey: "creatorCardEditor.niches.options.tech" },
        { id: "finance", labelKey: "creatorCardEditor.niches.options.finance" },
        { id: "education", labelKey: "creatorCardEditor.niches.options.education" },
        { id: "gaming", labelKey: "creatorCardEditor.niches.options.gaming" },
        { id: "lifestyle", labelKey: "creatorCardEditor.niches.options.lifestyle" },
        { id: "pets", labelKey: "creatorCardEditor.niches.options.pets" },
        { id: "home", labelKey: "creatorCardEditor.niches.options.home" },
        { id: "ecommerce", labelKey: "creatorCardEditor.niches.options.ecommerce" },
      ] as const,
    []
  )

  const knownNicheIds = useMemo<Set<string>>(() => new Set(nicheOptions.map((x) => x.id as string)), [nicheOptions])

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const saveInFlightRef = useRef(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loadErrorKind, setLoadErrorKind] = useState<
    "not_connected" | "supabase_invalid_key" | "load_failed" | null
  >(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveOk, setSaveOk] = useState(false)
  const [saveFlash, setSaveFlash] = useState(false)
  const saveFlashTimerRef = useRef<number | null>(null)

  const [showNewCardHint, setShowNewCardHint] = useState(false)

  const isDirtyRef = useRef(false)

  const markDirty = useCallback(() => {
    isDirtyRef.current = true
  }, [])

  const clearDirty = useCallback(() => {
    isDirtyRef.current = false
  }, [])

  const confirmLeaveIfDirty = useCallback(() => {
    if (!isDirtyRef.current) return true
    return window.confirm(t("creatorCardEditor.common.unsavedConfirm"))
  }, [t])

  const [introDraft, setIntroDraft] = useState("")
  const [introAppliedHint, setIntroAppliedHint] = useState(false)
  const introAppliedHintTimerRef = useRef<number | null>(null)

  const meQuery = useInstagramMe({ enabled: true })

  const igMe = meQuery.data as unknown
  const igMeObj = asRecord(igMe)
  const igProfile = (asRecord(igMeObj?.profile) ?? igMeObj) as unknown as InstagramProfileLite

  const displayUsername = useMemo(() => {
    const raw = typeof igProfile?.username === "string" ? String(igProfile.username).trim() : ""
    return raw
  }, [igProfile?.username])

  const displayName = useMemo(() => {
    const raw = (igProfile?.name ?? igProfile?.display_name ?? igProfile?.displayName) as unknown
    if (typeof raw === "string" && raw.trim()) return raw.trim()
    return displayUsername ? displayUsername : "—"
  }, [displayUsername, igProfile?.displayName, igProfile?.display_name, igProfile?.name])

  const [baseCard, setBaseCard] = useState<CreatorCardPayload | null>(null)
  const [deliverables, setDeliverables] = useState<string[]>([])
  const [collaborationNiches, setCollaborationNiches] = useState<string[]>([])
  const [pastCollaborations, setPastCollaborations] = useState<string[]>([])
  const [themeTypes, setThemeTypes] = useState<string[]>([])
  const [audienceProfiles, setAudienceProfiles] = useState<string[]>([])

  const themeChipOverflow = useTwoRowChipOverflow(themeTypes)
  const audienceChipOverflow = useTwoRowChipOverflow(audienceProfiles)

  const [primaryTypeTags, setPrimaryTypeTags] = useState<string[]>([])

  const [contactEmails, setContactEmails] = useState<string[]>([])
  const [contactInstagrams, setContactInstagrams] = useState<string[]>([])
  const [contactOthers, setContactOthers] = useState<string[]>([])
  const [contactEmailInput, setContactEmailInput] = useState("")
  const [contactInstagramInput, setContactInstagramInput] = useState("")
  const [contactOtherInput, setContactOtherInput] = useState("")

  const [profileImageFile, setProfileImageFile] = useState<File | null>(null)

  const [featuredItems, setFeaturedItems] = useState<FeaturedItem[]>([])
  const featuredItemsRef = useRef<FeaturedItem[]>([])
  const featuredAddInputRef = useRef<HTMLInputElement | null>(null)
  const featuredReplaceInputRef = useRef<HTMLInputElement | null>(null)
  const [isAddIgOpen, setIsAddIgOpen] = useState(false)
  const [newIgUrl, setNewIgUrl] = useState("")
  const [pendingIg, setPendingIg] = useState<{ url: string; oembed?: any; status: "idle" | "loading" | "success" | "error" } | null>(null)
  const pendingFeaturedReplaceIdRef = useRef<string | null>(null)
  const [suppressFeaturedTileClick, setSuppressFeaturedTileClick] = useState(false)
  const [featuredUploadingIds, setFeaturedUploadingIds] = useState<Set<string>>(new Set())
  const [editingFeaturedId, setEditingFeaturedId] = useState<string | null>(null)
  const [editingFeaturedBrand, setEditingFeaturedBrand] = useState("")
  const [editingFeaturedCollabTypeSelect, setEditingFeaturedCollabTypeSelect] = useState("")
  const [editingFeaturedCollabTypeCustom, setEditingFeaturedCollabTypeCustom] = useState("")
  const [igModalUrl, setIgModalUrl] = useState<string | null>(null)
  const [igOEmbedCache, setIgOEmbedCache] = useState<Record<string, OEmbedState>>({})

  const [__overlayMounted, set__overlayMounted] = useState(false)
  useEffect(() => {
    set__overlayMounted(true)
  }, [])
  
  // Initialize featured carousel scroll state
  useEffect(() => {
    const el = featuredCarouselRef.current
    if (!el) return
    const updateScrollState = () => {
      setCanScrollFeaturedLeft(el.scrollLeft > 2)
      setCanScrollFeaturedRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 2)
    }
    updateScrollState()
    const observer = new ResizeObserver(updateScrollState)
    observer.observe(el)
    return () => observer.disconnect()
  }, [featuredItems])

  useEffect(() => {
    if (!isMobile) {
      setMobilePreviewOpen(false)
      setMobileShowThemeAdd(false)
      setMobileShowAudienceAdd(false)
    }
  }, [isMobile])

  const closeMobilePreview = useCallback(() => {
    setMobilePreviewOpen(false)
    window.setTimeout(() => {
      const el = mobilePreviewTriggerRef.current
      if (el && typeof el.focus === "function") {
        el.focus()
      }
    }, 0)
  }, [])

  useEffect(() => {
    if (!isMobile) return
    if (!mobilePreviewOpen) return

    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        closeMobilePreview()
        return
      }

      if (e.key !== "Tab") return
      const root = mobilePreviewModalRef.current
      if (!root) return

      const focusables = Array.from(
        root.querySelectorAll<HTMLElement>(
          'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => {
        const style = window.getComputedStyle(el)
        return style.display !== "none" && style.visibility !== "hidden"
      })

      if (focusables.length === 0) {
        e.preventDefault()
        root.focus()
        return
      }

      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      const active = document.activeElement as HTMLElement | null

      if (e.shiftKey) {
        if (!active || active === first || !root.contains(active)) {
          e.preventDefault()
          last.focus()
        }
        return
      }

      if (!active || active === last || !root.contains(active)) {
        e.preventDefault()
        first.focus()
      }
    }

    window.addEventListener("keydown", onKeyDown)
    const raf = window.requestAnimationFrame(() => {
      mobilePreviewModalRef.current?.focus()
    })

    return () => {
      document.body.style.overflow = prevOverflow
      window.removeEventListener("keydown", onKeyDown)
      window.cancelAnimationFrame(raf)
    }
  }, [closeMobilePreview, isMobile, mobilePreviewOpen])

  useEffect(() => {
    if (!isMobile) return
    if (mobileShowThemeAdd) {
      window.setTimeout(() => mobileThemeInputRef.current?.focus(), 0)
    }
  }, [isMobile, mobileShowThemeAdd])

  useEffect(() => {
    if (!isMobile) return
    if (mobileShowAudienceAdd) {
      window.setTimeout(() => mobileAudienceInputRef.current?.focus(), 0)
    }
  }, [isMobile, mobileShowAudienceAdd])

  const openAddFeatured = useCallback(() => {
    featuredAddInputRef.current?.click()
  }, [])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const openEditFeatured = useCallback(
    (id: string) => {
      setFeaturedItems((prev) => {
        const picked = prev.find((x) => x.id === id)
        setEditingFeaturedId(id)
        setEditingFeaturedBrand(typeof picked?.brand === "string" ? picked.brand : "")
        const current = typeof picked?.collabType === "string" ? picked.collabType : ""
        if (current && COLLAB_TYPE_OPTIONS.includes(current as CollabTypeOptionId)) {
          setEditingFeaturedCollabTypeSelect(current)
          setEditingFeaturedCollabTypeCustom("")
        } else if (current) {
          setEditingFeaturedCollabTypeSelect(COLLAB_TYPE_OTHER_VALUE)
          setEditingFeaturedCollabTypeCustom(current)
        } else {
          setEditingFeaturedCollabTypeSelect(COLLAB_TYPE_OPTIONS[0])
          setEditingFeaturedCollabTypeCustom("")
        }
        return prev
      })
    },
    [setFeaturedItems]
  )

  const serializedContact = useMemo(() => {
    const emails = normalizeStringArray(contactEmails, 20)
    const instagrams = normalizeStringArray(contactInstagrams, 20)
    const others = normalizeStringArray(contactOthers, 20)

    const email = (emails[0] ?? "").trim()
    const instagram = (instagrams[0] ?? "").trim()
    const other = (others[0] ?? "").trim()

    if (!email && !instagram && !other && emails.length === 0 && instagrams.length === 0 && others.length === 0) return null
    return JSON.stringify({ email, instagram, other, emails, instagrams, others })
  }, [contactEmails, contactInstagrams, contactOthers])

  const previewContact = useMemo(() => {
    const readStr = (v: unknown) => (typeof v === "string" ? v.trim() : "")
    const readStrArr = (v: unknown) =>
      Array.isArray(v) ? v.map((x) => readStr(x)).filter(Boolean) : ([] as string[])

    const normalizeContact = (raw: unknown) => {
      let obj: unknown = raw
      if (typeof obj === "string") {
        try {
          obj = JSON.parse(obj)
        } catch {
          obj = {}
        }
      }

      const contactObj: Record<string, unknown> = isPlainRecord(obj) ? (obj as Record<string, unknown>) : {}

      const email1 = readStr(contactObj.email) || readStr(contactObj.contactEmail)
      const ig1 = readStr(contactObj.instagram) || readStr(contactObj.contactInstagram)
      const other1 = readStr(contactObj.other) || readStr(contactObj.contactOther)

      const emails = readStrArr(contactObj.emails)
      const instagrams = readStrArr(contactObj.instagrams)
      const others = readStrArr(contactObj.others)

      const finalEmails = emails.length ? emails : email1 ? [email1] : ([] as string[])
      const finalInstagrams = instagrams.length ? instagrams : ig1 ? [ig1] : ([] as string[])
      const finalOthers = others.length ? others : other1 ? [other1] : ([] as string[])

      contactObj.email = finalEmails[0] ?? ""
      contactObj.instagram = finalInstagrams[0] ?? ""
      contactObj.other = finalOthers[0] ?? ""
      contactObj.emails = finalEmails
      contactObj.instagrams = finalInstagrams
      contactObj.others = finalOthers

      return contactObj
    }

    return normalizeContact(serializedContact)
  }, [serializedContact])

  const [otherFormatEnabled, setOtherFormatEnabled] = useState(false)
  const [otherFormatInput, setOtherFormatInput] = useState("")

  const [pastCollabInput, setPastCollabInput] = useState("")

  const [otherNicheEnabled, setOtherNicheEnabled] = useState(false)
  const [otherNicheInput, setOtherNicheInput] = useState("")

  const [themeTypeInput, setThemeTypeInput] = useState("")
  const [audienceProfileInput, setAudienceProfileInput] = useState("")

  const brandInputRef = useRef<HTMLInputElement | null>(null)

  const [highlight, setHighlight] = useState<"formats" | "niches" | "brands" | null>(null)
  const highlightTimerRef = useRef<number | null>(null)

  const [activePreviewSection, setActivePreviewSection] = useState<
    "about" | "primaryNiche" | "audienceSummary" | "collaborationNiches" | "contact" | "formats" | null
  >(null)

  const flashHighlight = useCallback((key: "formats" | "niches" | "brands") => {
    setHighlight(key)
    if (highlightTimerRef.current != null) {
      window.clearTimeout(highlightTimerRef.current)
    }
    highlightTimerRef.current = window.setTimeout(() => {
      setHighlight(null)
      highlightTimerRef.current = null
    }, 1200)
  }, [])

  useEffect(() => {
    return () => {
      if (highlightTimerRef.current != null) {
        window.clearTimeout(highlightTimerRef.current)
        highlightTimerRef.current = null
      }

      if (introAppliedHintTimerRef.current != null) {
        window.clearTimeout(introAppliedHintTimerRef.current)
        introAppliedHintTimerRef.current = null
      }

      if (toastTimerRef.current != null) {
        window.clearTimeout(toastTimerRef.current)
        toastTimerRef.current = null
      }
    }
  }, [])

  const addThemeTypeTag = useCallback(
    (raw: string) => {
      const next = normalizeStringArray([raw], 1)
      if (next.length === 0) return
      setThemeTypes((prev) => normalizeStringArray([...prev, next[0]], 20))
    },
    [setThemeTypes]
  )

  const addAudienceProfileTag = useCallback(
    (raw: string) => {
      const next = normalizeStringArray([raw], 1)
      if (next.length === 0) return
      setAudienceProfiles((prev) => normalizeStringArray([...prev, next[0]], 20))
    },
    [setAudienceProfiles]
  )

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const isBackgroundRefresh = hasLoadedRef.current
      if (isBackgroundRefresh) {
        // background refresh: do not block the page with global loading UI
      } else {
        setLoading(true)
        setLoadError(null)
        setLoadErrorKind(null)
        setSaveOk(false)
        setShowNewCardHint(false)
      }
      try {
        const controller = new AbortController()
        const shouldTimeout = isBackgroundRefresh && postSaveSyncRef.current
        const timeoutId = shouldTimeout
          ? window.setTimeout(() => {
              controller.abort()
            }, 8000)
          : null

        const res = await fetch("/api/creator-card/me", {
          method: "GET",
          cache: "no-store",
          credentials: "include",
          signal: controller.signal,
        })

        if (timeoutId != null) window.clearTimeout(timeoutId)

        const jsonRaw: unknown = await res.json().catch(() => null)
        const json = (asRecord(jsonRaw) as unknown as CreatorCardMeResponse) ?? null
        if (cancelled) return

        if (!res.ok || !json?.ok) {
          if (res.status === 401) {
            setLoadErrorKind("not_connected")
            setLoadError(t("creatorCardEditor.errors.notConnected"))
            return
          }

          if (res.status === 500 && json?.error === "supabase_invalid_key") {
            setLoadErrorKind("supabase_invalid_key")
            setLoadError(null)
            return
          }

          setLoadErrorKind("load_failed")
          setLoadError(t("creatorCardEditor.errors.loadFailed"))
          return
        }

        const card = asRecord(json?.card) ?? null

        const meObj = asRecord(json?.me)
        const nextCreatorIdRaw = meObj ? readString(meObj.igUserId) : null
        const nextCreatorId = nextCreatorIdRaw ? String(nextCreatorIdRaw).trim() : ""
        setCreatorId(nextCreatorId || null)

        const nextBase: CreatorCardPayload | null = card
          ? {
              handle: readString(card?.handle) ?? null,
              displayName: readString(card?.display_name) ?? null,
              profileImageUrl:
                readString(card?.profileImageUrl) ??
                readString(card?.profile_image_url) ??
                null,
              niche: readString(card?.niche) ?? null,
              audience: readString(card?.audience) ?? null,
              themeTypes: Array.isArray(card?.themeTypes)
                ? (card?.themeTypes as unknown[]).filter((x): x is string => typeof x === "string")
                : Array.isArray(card?.theme_types)
                  ? (card?.theme_types as unknown[]).filter((x): x is string => typeof x === "string")
                  : null,
              audienceProfiles: Array.isArray(card?.audienceProfiles)
                ? (card?.audienceProfiles as unknown[]).filter((x): x is string => typeof x === "string")
                : Array.isArray(card?.audience_profiles)
                  ? (card?.audience_profiles as unknown[]).filter((x): x is string => typeof x === "string")
                  : null,
              deliverables: Array.isArray(card?.deliverables)
                ? (card?.deliverables as unknown[]).filter((x): x is string => typeof x === "string")
                : null,
              contact: readString(card?.contact) ?? null,
              portfolio: Array.isArray(card?.portfolio) ? (card?.portfolio as unknown[]) : null,
              isPublic: typeof card?.is_public === "boolean" ? (card.is_public as boolean) : null,
              collaborationNiches: Array.isArray(card?.collaborationNiches)
                ? (card?.collaborationNiches as unknown[]).filter((x): x is string => typeof x === "string")
                : Array.isArray(card?.collaboration_niches)
                  ? (card?.collaboration_niches as unknown[]).filter((x): x is string => typeof x === "string")
                  : null,
              pastCollaborations: Array.isArray(card?.pastCollaborations)
                ? (card?.pastCollaborations as unknown[]).filter((x): x is string => typeof x === "string")
                : Array.isArray(card?.past_collaborations)
                  ? (card?.past_collaborations as unknown[]).filter((x): x is string => typeof x === "string")
                  : null,
            }
          : null

        setBaseCard(nextBase)

        const shouldHydrateDrafts = !isBackgroundRefresh || !isDirtyRef.current || postSaveSyncRef.current
        if (shouldHydrateDrafts) {
          setIntroDraft(typeof nextBase?.audience === "string" ? nextBase.audience : "")
          const nextDeliverables = normalizeStringArray(nextBase?.deliverables ?? [], 50)
          setDeliverables(nextDeliverables)
          setCollaborationNiches(normalizeStringArray(nextBase?.collaborationNiches ?? [], 20))
          setPastCollaborations(normalizeStringArray(nextBase?.pastCollaborations ?? [], 20))
          setThemeTypes(normalizeStringArray(nextBase?.themeTypes ?? [], 20))
          setAudienceProfiles(normalizeStringArray(nextBase?.audienceProfiles ?? [], 20))
        }

        const parsedContact = (() => {
          const raw = typeof nextBase?.contact === "string" ? nextBase.contact.trim() : ""
          if (!raw) return { emails: [] as string[], instagrams: [] as string[], others: [] as string[] }
          try {
            const obj = asRecord(JSON.parse(raw) as unknown)
            const emails = normalizeStringArray(
              Array.isArray(obj?.emails)
                ? (obj.emails as unknown[])
                : typeof obj?.email === "string"
                  ? [obj.email]
                  : [],
              20
            )
            const instagrams = normalizeStringArray(
              Array.isArray(obj?.instagrams)
                ? (obj.instagrams as unknown[])
                : typeof obj?.instagram === "string"
                  ? [obj.instagram]
                  : [],
              20
            )
            const others = normalizeStringArray(
              Array.isArray(obj?.others)
                ? (obj.others as unknown[])
                : typeof obj?.other === "string"
                  ? [obj.other]
                  : [],
              20
            )
            return { emails, instagrams, others }
          } catch {
            return { emails: [] as string[], instagrams: [] as string[], others: raw ? [raw] : [] }
          }
        })()
        setContactEmails(parsedContact.emails)
        setContactInstagrams(parsedContact.instagrams)
        setContactOthers(parsedContact.others)
        setContactEmailInput("")
        setContactInstagramInput("")
        setContactOtherInput("")

        const nextFeaturedItems = (() => {
          // Check if card has featuredItems stored in flexible JSON field
          // Support both camelCase (from API mapping) and snake_case (from DB)
          const storedFeaturedItems = Array.isArray(card?.featuredItems) 
            ? (card.featuredItems as unknown[])
            : Array.isArray((card as any)?.featured_items)
              ? ((card as any).featured_items as unknown[])
              : null
          
          if (storedFeaturedItems) {
            // Use stored featuredItems (full data with text/ig items)
            const items: FeaturedItem[] = []
            for (const row of storedFeaturedItems) {
              if (!row || typeof row !== "object") continue
              const obj = row as Record<string, unknown>
              const id = typeof obj.id === "string" ? obj.id.trim() : ""
              if (!id) continue
              
              const itemType = typeof obj.type === "string" ? obj.type : "media"
              
              if (itemType === "text") {
                items.push({
                  id,
                  type: "text",
                  url: "",
                  brand: "",
                  collabType: "",
                  title: typeof obj.title === "string" ? obj.title : "",
                  text: typeof obj.text === "string" ? obj.text : "",
                })
              } else if (itemType === "ig") {
                items.push({
                  id,
                  type: "ig",
                  url: typeof obj.url === "string" ? obj.url : "",
                  brand: "",
                  collabType: "",
                  caption: typeof obj.caption === "string" ? obj.caption : "",
                  isAdded: typeof obj.isAdded === "boolean" ? obj.isAdded : true,
                })
              } else {
                items.push({
                  id,
                  type: "media",
                  url: typeof obj.url === "string" ? obj.url : "",
                  brand: typeof obj.brand === "string" ? obj.brand : "",
                  collabType: typeof obj.collabType === "string" ? obj.collabType : "",
                  caption: typeof obj.caption === "string" ? obj.caption : "",
                })
              }
            }
            return items.slice(0, 20)
          }
          
          // Fallback: migrate from legacy portfolio (media-only)
          const raw = Array.isArray(card?.portfolio) ? (card.portfolio as unknown[]) : []
          const items: FeaturedItem[] = []

          for (const row of raw) {
            if (!row || typeof row !== "object") continue
            const obj = row as Record<string, unknown>

            const id = typeof obj.id === "string" ? obj.id.trim() : ""
            if (!id) continue

            const brand = typeof obj.brand === "string" ? obj.brand : ""
            const collabType =
              typeof obj.collabType === "string"
                ? obj.collabType
                : typeof obj.collabtype === "string"
                  ? obj.collabtype
                  : ""
            const caption = typeof obj.caption === "string" ? obj.caption : ""
            const url =
              typeof obj.url === "string"
                ? obj.url
                : typeof obj.imageUrl === "string"
                  ? obj.imageUrl
                  : typeof obj.image_url === "string"
                    ? obj.image_url
                    : ""

            items.push({
              id,
              type: "media",
              url,
              brand,
              collabType,
              caption,
            })
          }

          return items.slice(0, 20)
        })()

        setFeaturedItems((prev) => {
          for (const item of prev) {
            if (typeof item.url === "string" && item.url.startsWith("blob:")) URL.revokeObjectURL(item.url)
          }
          return nextFeaturedItems
        })

        const primaryParts = (() => {
          const raw = typeof nextBase?.niche === "string" ? nextBase.niche : ""
          if (!raw.trim()) return []
          return raw
            .split(/[,、·|]/g)
            .map((x) => x.trim())
            .filter(Boolean)
        })()
        setPrimaryTypeTags(normalizeStringArray(primaryParts, 6))

        if (shouldHydrateDrafts) {
          const nextDeliverables = normalizeStringArray(nextBase?.deliverables ?? [], 50)
          const customs = nextDeliverables.filter((x) => !knownFormatIds.has(x))
          setOtherFormatEnabled(customs.length > 0)
          setOtherFormatInput("")
        }

        if (shouldHydrateDrafts) {
          const nicheCustoms = normalizeStringArray(nextBase?.collaborationNiches ?? [], 20).filter((x) => !knownNicheIds.has(x))
          setOtherNicheEnabled(nicheCustoms.length > 0)
          setOtherNicheInput("")
        }

        const isLikelyEmpty = (() => {
          const hasAnyText =
            Boolean(nextBase?.displayName && String(nextBase.displayName).trim()) ||
            Boolean(nextBase?.niche && String(nextBase.niche).trim()) ||
            Boolean(nextBase?.audience && String(nextBase.audience).trim()) ||
            Boolean(nextBase?.contact && String(nextBase.contact).trim())
          const hasAnyLists =
            normalizeStringArray(nextBase?.deliverables ?? [], 1).length > 0 ||
            normalizeStringArray(nextBase?.collaborationNiches ?? [], 1).length > 0 ||
            normalizeStringArray(nextBase?.pastCollaborations ?? [], 1).length > 0
          return !hasAnyText && !hasAnyLists
        })()

        setShowNewCardHint(isLikelyEmpty)
        hasLoadedRef.current = true
        if (postSaveSyncRef.current) postSaveSyncRef.current = false
      } catch {
        if (!isBackgroundRefresh) {
          setLoadErrorKind("load_failed")
          setLoadError(t("creatorCardEditor.errors.loadFailed"))
        } else if (postSaveSyncRef.current) {
          postSaveSyncRef.current = false
          showToast(t("creatorCardEditor.success.syncDelayed"))
        }
      } finally {
        if (cancelled) return
        setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [knownFormatIds, knownNicheIds, refetchTick, showToast, t])

  useEffect(() => {
    setBaseCard((prev) => {
      const nextContact = serializedContact
      if ((prev?.contact ?? null) === nextContact) return prev
      return { ...(prev ?? {}), contact: nextContact }
    })
  }, [serializedContact])

  useEffect(() => {
    return () => {
      for (const item of featuredItemsRef.current) {
        if (typeof item.url === "string" && item.url.startsWith("blob:")) URL.revokeObjectURL(item.url)
      }
    }
  }, [])

  useEffect(() => {
    featuredItemsRef.current = featuredItems
  }, [featuredItems])

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!isDirtyRef.current) return
      e.preventDefault()
      e.returnValue = ""
    }
    window.addEventListener("beforeunload", onBeforeUnload)
    return () => window.removeEventListener("beforeunload", onBeforeUnload)
  }, [])

  useEffect(() => {
    history.pushState(null, "", location.href)

    const onPopState = () => {
      if (!isDirtyRef.current) return
      const ok = confirmLeaveIfDirty()
      if (ok) return
      history.pushState(null, "", location.href)
    }

    window.addEventListener("popstate", onPopState)
    return () => window.removeEventListener("popstate", onPopState)
  }, [confirmLeaveIfDirty])

  useEffect(() => {
    if (creatorId) {
      localStorage.setItem("creatorCardId", creatorId)
    }
  }, [creatorId])

  useEffect(() => {
    if (!creatorId) {
      setCreatorStats(null)
      return
    }

    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/creators/${encodeURIComponent(creatorId)}/stats`, {
          method: "GET",
          cache: "no-store",
          credentials: "include",
        })
        const jsonRaw: unknown = await res.json().catch(() => null)
        const json = (asRecord(jsonRaw) as unknown as CreatorStatsResponse) ?? null
        if (cancelled) return
        if (!res.ok || !json?.ok) {
          setCreatorStats(null)
          return
        }
        const statsObj = asRecord(json?.stats)
        const engagementRatePct = statsObj ? readNumber(statsObj.engagementRatePct) : null
        setCreatorStats(engagementRatePct == null ? null : { engagementRatePct })
      } catch {
        if (cancelled) return
        setCreatorStats(null)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [creatorId])

  const handleRetryLoad = useCallback(() => {
    setRefetchTick((x) => x + 1)
  }, [])

  const addOtherFormat = useCallback(() => {
    const trimmed = otherFormatInput.trim()
    if (!trimmed) return
    setDeliverables((prev) => normalizeStringArray([...prev, trimmed], 50))
    setOtherFormatInput("")
    flashHighlight("formats")
    markDirty()
  }, [flashHighlight, markDirty, otherFormatInput, setDeliverables])

  const addPastCollab = useCallback(() => {
    const next = normalizeStringArray([pastCollabInput], 1)
    if (next.length === 0) return
    setPastCollaborations((prev) => normalizeStringArray([...prev, next[0]], 20))
    setPastCollabInput("")
    markDirty()
  }, [markDirty, pastCollabInput, setPastCollaborations])

  const isPersistedUrl = (raw: string) =>
    !!raw && (raw.startsWith("https://") || raw.startsWith("http://") || raw.startsWith("/"))

  const fileToDataUrl = useCallback((file: File) => {
    return new Promise<string>((resolve) => {
      const reader = new FileReader()
      reader.onload = () => {
        resolve(typeof reader.result === "string" ? reader.result : "")
      }
      reader.onerror = () => resolve("")
      reader.readAsDataURL(file)
    })
  }, [])

  const addOtherNiche = useCallback(() => {
    const trimmed = otherNicheInput.trim()
    if (!trimmed) return
    setCollaborationNiches((prev) => {
      const lower = trimmed.toLowerCase()
      const hasDup = prev.some((x) => x.toLowerCase() === lower)
      if (hasDup) return prev
      return [...prev, trimmed]
    })
    setOtherNicheInput("")
    flashHighlight("niches")
  }, [flashHighlight, otherNicheInput])

  useEffect(() => {
    setBaseCard((prev) => {
      if (!prev) return prev
      const joined = primaryTypeTags.length > 0 ? primaryTypeTags.join(activeLocale === "zh-TW" ? "、" : ", ") : null
      if ((prev.niche ?? null) === joined) return prev
      return { ...prev, niche: joined }
    })
  }, [activeLocale, primaryTypeTags])

  const handleSave = useCallback(async () => {
    if (saving) return
    if (saveInFlightRef.current) return

    if (featuredUploadingIds.size > 0) {
      showToast(t("creatorCard.form.featured.uploadingWait"))
      return
    }

    saveInFlightRef.current = true
    setSaving(true)
    setSaveError(null)
    setSaveOk(false)
    showToast(t("creatorCardEditor.actions.saving"), 6000)
    try {
      const nextProfileImageUrl = await (async () => {
        if (profileImageFile) {
          try {
            return await fileToDataUrl(profileImageFile)
          } catch {
            return undefined
          }
        }
        const raw2 = typeof baseCard?.profileImageUrl === "string" ? String(baseCard.profileImageUrl) : ""
        const raw3 = typeof igProfile?.profile_picture_url === "string" ? String(igProfile.profile_picture_url) : ""
        const s = (raw2 || raw3).trim()
        return s ? s : undefined
      })()

      const nextAudience = introDraft.trim() ? introDraft : (baseCard?.audience ?? "")

      const payload: any = {
        handle: baseCard?.handle ?? undefined,
        displayName: baseCard?.displayName ?? undefined,
        profileImageUrl: nextProfileImageUrl,
        niche: baseCard?.niche ?? undefined,
        audience: nextAudience || undefined,
        themeTypes: normalizeStringArray(themeTypes, 20),
        audienceProfiles: normalizeStringArray(audienceProfiles, 20),
        contact: serializedContact,
        portfolio: featuredItems
          .filter((x) => {
            const itemType = x.type || "media"
            return itemType === "media" && isPersistedUrl(x.url || "")
          })
          .map((x, idx) => ({
            id: x.id,
            url: x.url || "",
            brand: x.brand || "",
            collabType: x.collabType || "",
            caption: x.caption || "",
            order: idx,
          })) as any,
        featuredItems: featuredItems.map((x, idx) => {
          const itemType = x.type || "media"
          if (itemType === "text") {
            return {
              id: x.id,
              type: "text",
              title: x.title || "",
              text: x.text || "",
              order: idx,
            }
          }
          if (itemType === "ig") {
            return {
              id: x.id,
              type: "ig",
              url: x.url || "",
              caption: x.caption || "",
              order: idx,
            }
          }
          return {
            id: x.id,
            type: "media",
            url: x.url || "",
            brand: x.brand || "",
            collabType: x.collabType || "",
            caption: x.caption || "",
            order: idx,
          }
        }) as any,
        isPublic: baseCard?.isPublic ?? undefined,
        deliverables: normalizeStringArray(deliverables, 50),
        collaborationNiches: normalizeStringArray(collaborationNiches, 20),
        pastCollaborations: normalizeStringArray(pastCollaborations, 20),
      }

      const url = "/api/creator-card/upsert"
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      })

      const jsonRaw: unknown = await res.clone().json().catch(() => null)
      const json = (asRecord(jsonRaw) as unknown as CreatorCardUpsertResponse) ?? null
      const text = json ? null : await res.text().catch(() => null)

      if (!res.ok || !json?.ok) {
        if (res.status === 401) {
          setSaveError("未登入或登入已過期 / Not authenticated (session expired)")
          showToast(t("creatorCardEditor.errors.saveFailed"))
          return
        }

        if (res.status === 403 && json?.error === "not_connected") {
          setSaveError("尚未連結 IG 或連結已失效，請重新連結 / IG not connected or expired, please reconnect")
          showToast(t("creatorCardEditor.errors.saveFailed"))
          return
        }

        const serverMsg =
          typeof json?.error === "string"
            ? json.error
            : typeof json?.message === "string"
              ? json.message
              : typeof text === "string" && text.trim()
                ? text.trim()
                : null

        setSaveError(serverMsg ? `${t("creatorCardEditor.errors.saveFailed")}: ${serverMsg}` : t("creatorCardEditor.errors.saveFailed"))
        showToast(t("creatorCardEditor.errors.saveFailed"))
        return
      }

      setSaveOk(true)
      showToast(t("creatorCardEditor.success.saved"))

      // Prepare updated card data for state update
      const updatedCardData = {
        profileImageUrl: nextProfileImageUrl ?? null,
        audience: nextAudience || null,
        themeTypes: normalizeStringArray(themeTypes, 20),
        audienceProfiles: normalizeStringArray(audienceProfiles, 20),
        deliverables: normalizeStringArray(deliverables, 50),
        collaborationNiches: normalizeStringArray(collaborationNiches, 20),
        pastCollaborations: normalizeStringArray(pastCollaborations, 20),
        contact: serializedContact,
        portfolio: featuredItems
          .filter((x) => {
            const itemType = x.type || "media"
            return itemType === "media" && isPersistedUrl(x.url || "")
          })
          .map((x, idx) => ({
            id: x.id,
            url: x.url || "",
            brand: x.brand || "",
            collabType: x.collabType || "",
            caption: x.caption || "",
            order: idx,
          })) as any,
        featuredItems: featuredItems.map((x, idx) => {
          const itemType = x.type || "media"
          if (itemType === "text") {
            return {
              id: x.id,
              type: "text",
              title: x.title || "",
              text: x.text || "",
              order: idx,
            }
          }
          if (itemType === "ig") {
            return {
              id: x.id,
              type: "ig",
              url: x.url || "",
              caption: x.caption || "",
              order: idx,
            }
          }
          return {
            id: x.id,
            type: "media",
            url: x.url || "",
            brand: x.brand || "",
            collabType: x.collabType || "",
            caption: x.caption || "",
            order: idx,
          }
        }) as any,
      }

      // CRITICAL: Try to persist to localStorage for instant UI, but don't block on it
      // Even if localStorage fails (privacy mode), DB sync will work via sessionStorage flag
      if (typeof window !== "undefined") {
        // Best-effort localStorage write (instant UI hydration)
        try {
          let persistedCard = asRecord(json?.card)
          
          // If upsert didn't return card data, fetch from /me endpoint
          if (!persistedCard || Object.keys(persistedCard).length === 0) {
            if (process.env.NODE_ENV !== "production") {
              console.log("[CreatorCard Save] ⚠️ No card in upsert response, fetching from /me")
            }
            
            const meRes = await fetch("/api/creator-card/me", {
              method: "GET",
              cache: "no-store",
              headers: { "cache-control": "no-cache" },
            })
            
            if (meRes.ok) {
              const meJson = await meRes.json()
              persistedCard = asRecord(meJson?.card)
            }
          }
          
          if (!persistedCard || Object.keys(persistedCard).length === 0) {
            if (process.env.NODE_ENV !== "production") {
              console.error("[CreatorCard Save] ❌ No card data available for localStorage")
            }
          } else {
            // Store the persisted card (already has both snake_case and camelCase from API)
            const draftJson = JSON.stringify(persistedCard)
            localStorage.setItem("creator_card_draft_v1", draftJson)
            localStorage.setItem("creator_card_updated_at", String(Date.now()))
            
            if (process.env.NODE_ENV !== "production") {
              console.log("[CreatorCard Save] ✅ localStorage written:", {
                source: json?.card ? "upsert response" : "/me fetch",
                size: draftJson.length,
                keys: Object.keys(persistedCard).length,
                hasAudience: !!(persistedCard.audience),
                hasFeaturedItems: Array.isArray(persistedCard.featuredItems) || Array.isArray(persistedCard.featured_items),
              })
            }
          }
        } catch (err) {
          if (process.env.NODE_ENV !== "production") {
            console.error("[CreatorCard Save] ❌ localStorage write failed:", err)
          }
        }
        
        // ALWAYS set flag after save success (even if localStorage failed)
        // This ensures DB refresh will happen on results page
        window.sessionStorage.setItem("creatorCard:updated", "1")
      }

      setBaseCard((prev) => ({
        ...(prev ?? {}),
        ...updatedCardData,
      }))

      clearDirty()

      postSaveSyncRef.current = true
      window.setTimeout(() => setRefetchTick((x) => x + 1), 0)
    } catch {
      setSaveError(t("creatorCardEditor.errors.saveFailed"))
      showToast(t("creatorCardEditor.errors.saveFailed"))
    } finally {
      saveInFlightRef.current = false
      setSaving(false)
    }
  }, [audienceProfiles, baseCard, clearDirty, collaborationNiches, deliverables, featuredItems, fileToDataUrl, igProfile?.profile_picture_url, introDraft, pastCollaborations, profileImageFile, saving, serializedContact, showToast, t, themeTypes])

  const handleBack = () => {
    if (returnTo) {
      // If returning to results after save, add ccUpdated flag and hash
      if (returnTo.includes("/results")) {
        const hasHash = returnTo.includes("#creator-card")
        const hasQuery = returnTo.includes("?")
        const separator = hasQuery ? "&" : "?"
        const updatedUrl = hasHash 
          ? returnTo.replace("#creator-card", `${separator}ccUpdated=1#creator-card`)
          : `${returnTo}${separator}ccUpdated=1#creator-card`
        router.push(updatedUrl)
        return
      }
      router.push(returnTo)
      return
    }
    router.back()
  }

  const brandHelperText = useMemo(() => {
    const max = 20
    return t("creatorCardEditor.pastCollaborations.helper").replace("{count}", String(pastCollaborations.length)).replace("{max}", String(max))
  }, [pastCollaborations.length, t])

  const finiteNumOrNull = useCallback((v: unknown): number | null => {
    const n = typeof v === "number" ? v : Number(v)
    return Number.isFinite(n) ? n : null
  }, [])

  const formatNum = useCallback((n: number | null) => (n === null ? "—" : n.toLocaleString()), [])

  const followersText = useMemo(() => {
    const followers = finiteNumOrNull(igProfile?.followers_count)
    return typeof followers === "number" && Number.isFinite(followers) ? formatNum(followers) : null
  }, [finiteNumOrNull, formatNum, igProfile?.followers_count])

  const postsText = useMemo(() => {
    const posts = finiteNumOrNull(igProfile?.media_count)
    return typeof posts === "number" && Number.isFinite(posts) ? formatNum(posts) : null
  }, [finiteNumOrNull, formatNum, igProfile?.media_count])

  const engagementRateText = useMemo(() => {
    const pct = typeof creatorStats?.engagementRatePct === "number" ? creatorStats.engagementRatePct : null
    return typeof pct === "number" && Number.isFinite(pct) ? `${pct.toFixed(2)}%` : null
  }, [creatorStats?.engagementRatePct])

  const loadingSkeleton = (
    <div className="mt-6 grid grid-cols-1 lg:grid-cols-12 gap-4 min-w-0 animate-pulse">
      <div className="lg:col-span-5 space-y-4 min-w-0">
        {Array.from({ length: 3 }).map((_, idx) => (
          <div key={idx} className="rounded-xl border border-slate-200 bg-white">
            <div className="p-6">
              <div className="h-4 w-40 bg-slate-200 rounded" />
              <div className="mt-3 h-3 w-64 bg-slate-100 rounded" />
              <div className="mt-4 flex flex-wrap gap-2">
                {Array.from({ length: 6 }).map((__, j) => (
                  <div key={j} className="h-9 w-24 rounded-full bg-slate-100" />
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="lg:col-span-7 min-w-0">
        <div className="rounded-xl border border-slate-200 bg-white">
          <div className="p-6">
            <div className="h-4 w-48 bg-slate-200 rounded" />
            <div className="mt-3 h-3 w-64 bg-slate-100 rounded" />
            <div className="mt-6 h-72 w-full rounded-xl bg-slate-100" />
          </div>
        </div>
      </div>
    </div>
  )

  useEffect(() => {
    if (!saveOk) return
    setSaveFlash(true)
    if (saveFlashTimerRef.current != null) window.clearTimeout(saveFlashTimerRef.current)
    saveFlashTimerRef.current = window.setTimeout(() => {
      setSaveFlash(false)
      saveFlashTimerRef.current = null
    }, 1000)
  }, [saveOk])

  useEffect(() => {
    return () => {
      if (saveFlashTimerRef.current != null) {
        window.clearTimeout(saveFlashTimerRef.current)
        saveFlashTimerRef.current = null
      }
    }
  }, [])

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10">
      <div aria-live="polite" className="sr-only">
        {toast ?? ""}
      </div>
      {toast ? (
        <div className="fixed top-[calc(env(safe-area-inset-top)+12px)] inset-x-0 z-[80] flex justify-center px-4">
          <div className="max-w-[560px] w-full">
            <div className="rounded-xl border border-white/10 bg-[#0b1220]/85 backdrop-blur-md px-4 py-3 text-sm text-slate-200 shadow-xl break-words [overflow-wrap:anywhere]">
              {toast}
            </div>
          </div>
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-slate-100">{t("creatorCardEditor.title")}</h1>
          <div className="mt-1 text-sm text-slate-300 min-w-0 break-words [overflow-wrap:anywhere]">{t("creatorCardEditor.subtitle")}</div>
        </div>

        <div className="shrink-0 flex items-center gap-2">
          <div className="relative">
            <Button
              variant="primary"
              className="ring-1 ring-white/15 hover:ring-white/25"
              onClick={handleSave}
              disabled={saving || loading || loadErrorKind === "not_connected" || loadErrorKind === "supabase_invalid_key" || featuredUploadingIds.size > 0}
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              {saving ? t("creatorCardEditor.actions.saving") : t("creatorCardEditor.actions.save")}
            </Button>
            {featuredUploadingIds.size > 0 && !saving ? (
              <div className="absolute -bottom-6 right-0 text-xs text-amber-400/80">
                {t("creatorCard.form.featured.uploadingWait")}
              </div>
            ) : null}
            {saveFlash && !saving && !loading ? (
              <div className="pointer-events-none absolute -bottom-8 right-0 rounded-full border border-emerald-400/25 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-200">
                {t("creatorCardEditor.success.saved")}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {loadErrorKind === "supabase_invalid_key" ? (
        <div className="mt-4 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          <div className="font-semibold">{t("creatorCardEditor.errors.supabaseInvalidKey.title")}</div>
          <div className="mt-1 text-amber-100/80">{t("creatorCardEditor.errors.supabaseInvalidKey.body")}</div>
        </div>
      ) : null}

      {loadError ? (
        <div className="mt-4 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          <div className="min-w-0 break-words [overflow-wrap:anywhere]">{loadError}</div>
          {loadErrorKind === "load_failed" ? (
            <div className="mt-3">
              <Button type="button" variant="outline" onClick={handleRetryLoad} disabled={loading}>
                {t("creatorCardEditor.actions.retry")}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
      {saveError ? (
        <div className="mt-4 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-200">{saveError}</div>
      ) : null}
      {saveOk ? (
        <div className="mt-4 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{t("creatorCardEditor.success.saved")}</div>
      ) : null}

      {showNewCardHint && !loading && !loadErrorKind ? (
        <div className="mt-4 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
          <div className="font-semibold text-slate-900">{t("creatorCardEditor.empty.title")}</div>
          <div className="mt-1 text-slate-600 min-w-0 break-words [overflow-wrap:anywhere]">{t("creatorCardEditor.empty.body")}</div>
        </div>
      ) : null}

      {loading ? (
        loadingSkeleton
      ) : (
        <div
          className="mt-6 grid grid-cols-1 lg:grid-cols-12 gap-4 min-w-0"
          style={
            isMobile
              ? {
                  paddingBottom: "calc(env(safe-area-inset-bottom) + 96px)",
                }
              : undefined
          }
        >
          <div className="lg:col-span-5 min-w-0" onChangeCapture={markDirty} onInputCapture={markDirty}>
            {(() => {
              type LocalMobileSectionKey =
                | "profile"
                | "contact"
                | "featured"
                | "formats"
                | "niches"
                | "brands"
                | "past"

              const formatLabels = (() => {
                const out: string[] = []
                const seen = new Set<string>()

                const hasFb = deliverables.includes("fb_post") || deliverables.includes("fb") || deliverables.includes("facebook")
                const normalized = deliverables.filter((x) => x !== "fb_post" && x !== "fb" && x !== "facebook")
                if (hasFb) normalized.push("fb_post")

                for (const id of normalized) {
                  if (id === "other") continue
                  const label = knownCollabTypeIds.has(id) ? t(collabTypeLabelKey(id as CollabTypeOptionId)) : id
                  const s = typeof label === "string" ? label.trim() : ""
                  if (!s) continue
                  const key = s.toLowerCase()
                  if (seen.has(key)) continue
                  seen.add(key)
                  out.push(s)
                }

                if (otherFormatEnabled) {
                  const otherLabel = t("creatorCardEditor.formats.options.other")
                  const s = typeof otherLabel === "string" ? otherLabel.trim() : ""
                  if (s) out.push(s)
                }

                return out
              })()

              const nicheLabels = (() => {
                const out: string[] = []
                const seen = new Set<string>()
                for (const id of collaborationNiches) {
                  const opt = nicheOptions.find((x) => x.id === id)
                  const label = opt ? t(opt.labelKey) : id
                  const s = typeof label === "string" ? label.trim() : ""
                  if (!s) continue
                  const key = s.toLowerCase()
                  if (seen.has(key)) continue
                  seen.add(key)
                  out.push(s)
                }
                return out
              })()

              const formatsSummary = selectedSummary(formatLabels, activeLocale, t)
              const nichesSummary = selectedSummary(nicheLabels, activeLocale, t)

              const sections: Array<{
                key: LocalMobileSectionKey
                titleZh: string
                titleEn: string
                headerAction?: () => ReactNode
                render: () => ReactNode
              }> = [
                {
                  key: "profile",
                  titleZh: "基本資料",
                  titleEn: "Basic Info",
                  render: () => (
                    <>
                      <div className="min-w-0">
                        <div className="text-[12px] font-semibold text-white/55">{t("creatorCardEditor.profile.bioTitle")}</div>
                        <div className="mt-2 relative">
                          <textarea
                            value={introDraft}
                            placeholder={t("creatorCardEditor.profile.bioPlaceholder")}
                            onChange={(e) => setIntroDraft(e.target.value)}
                            onFocus={() => setActivePreviewSection("about")}
                            className="w-full min-h-[96px] resize-y rounded-md border border-white/10 bg-slate-950/40 px-3 py-2 pr-24 pb-12 text-sm text-slate-100 placeholder:text-slate-400 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="absolute bottom-3 right-3"
                            onClick={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                              setBaseCard((prev) => ({ ...(prev ?? {}), audience: introDraft }))
                              setIntroAppliedHint(true)
                              if (introAppliedHintTimerRef.current != null) window.clearTimeout(introAppliedHintTimerRef.current)
                              introAppliedHintTimerRef.current = window.setTimeout(() => {
                                setIntroAppliedHint(false)
                                introAppliedHintTimerRef.current = null
                              }, 1600)
                            }}
                            disabled={loading || loadErrorKind === "not_connected" || loadErrorKind === "supabase_invalid_key"}
                          >
                            {t("creatorCardEditor.formats.otherAdd")}
                          </Button>
                        </div>
                        {introAppliedHint ? (
                          <div className="mt-2 text-xs text-slate-600">已套用到預覽，記得按右上儲存</div>
                        ) : null}
                      </div>

                      <div className="min-w-0">
                        <div className="text-[12px] font-semibold text-white/55">{t("creatorCardEditor.profile.themeTitle")}</div>
                        <div className="mt-2">
                          <div className="flex flex-col sm:flex-row gap-2 min-w-0">
                            <Input
                              value={themeTypeInput}
                              placeholder={t("creatorCardEditor.profile.themePlaceholder")}
                              className="bg-slate-950/40 border-white/10 text-slate-100 placeholder:text-slate-400 focus-visible:ring-white/20"
                              onChange={(e) => setThemeTypeInput(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault()
                                  addThemeTypeTag(themeTypeInput)
                                  setThemeTypeInput("")
                                }
                              }}
                            />
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="shrink-0"
                              onClick={() => {
                                addThemeTypeTag(themeTypeInput)
                                setThemeTypeInput("")
                              }}
                              disabled={!themeTypeInput.trim()}
                            >
                              {t("creatorCardEditor.formats.otherAdd")}
                            </Button>
                          </div>
                        </div>
                        {themeTypes.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {themeTypes.map((tag) => (
                              <span
                                key={tag}
                                className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm text-slate-100"
                              >
                                <span className="min-w-0 truncate max-w-[240px]">{tag}</span>
                                <button
                                  type="button"
                                  className="shrink-0 rounded-full p-1 hover:bg-white/10"
                                  onClick={() => setThemeTypes((prev) => prev.filter((x) => x !== tag))}
                                  aria-label={t("creatorCardEditor.pastCollaborations.remove")}
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="min-w-0">
                        <div className="text-[12px] font-semibold text-white/55">{t("creatorCardEditor.profile.audienceTitle")}</div>
                        {audienceProfiles.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {audienceProfiles.map((tag) => (
                              <button
                                key={tag}
                                type="button"
                                onClick={() => setAudienceProfiles((prev) => prev.filter((x) => x !== tag))}
                                className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-slate-100 hover:bg-white/10"
                              >
                                <span className="min-w-0 truncate max-w-[240px]">{tag}</span>
                                <span className="ml-1.5 text-slate-400" aria-hidden="true">
                                  ×
                                </span>
                              </button>
                            ))}
                          </div>
                        )}
                        <div className="mt-2">
                          <div className="flex flex-col sm:flex-row gap-2 min-w-0">
                            <Input
                              value={audienceProfileInput}
                              placeholder={t("creatorCardEditor.profile.audiencePlaceholder")}
                              className="bg-slate-950/40 border-white/10 text-slate-100 placeholder:text-slate-400 focus-visible:ring-white/20"
                              onChange={(e) => setAudienceProfileInput(e.target.value)}
                              onFocus={() => setActivePreviewSection("audienceSummary")}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault()
                                  addAudienceProfileTag(audienceProfileInput)
                                  setAudienceProfileInput("")
                                }
                              }}
                            />
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="shrink-0"
                              onClick={() => {
                                addAudienceProfileTag(audienceProfileInput)
                                setAudienceProfileInput("")
                              }}
                              disabled={!audienceProfileInput.trim()}
                            >
                              {t("creatorCardEditor.formats.otherAdd")}
                            </Button>
                          </div>
                        </div>
                      </div>
                    </>
                  ),
                },
                {
                  key: "contact",
                  titleZh: "聯絡方式",
                  titleEn: "Contact",
                  render: () => (
                    <>
                      <div className="min-w-0">
                        <div className="text-[11px] font-semibold text-white/55">Email</div>
                        {contactEmails.length > 0 ? (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {contactEmails.map((tag) => (
                              <span
                                key={tag}
                                className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm text-slate-100"
                              >
                                <span className="min-w-0 truncate max-w-[240px]">{tag}</span>
                                <button
                                  type="button"
                                  className="shrink-0 rounded-full p-1 hover:bg-white/10"
                                  onClick={() => {
                                    setContactEmails((prev) => prev.filter((x) => x !== tag))
                                    markDirty()
                                  }}
                                  aria-label={t("creatorCardEditor.pastCollaborations.remove")}
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </span>
                            ))}
                          </div>
                        ) : null}
                        <div className="mt-2">
                          <div className="flex flex-col sm:flex-row gap-2 min-w-0">
                            <Input
                              value={contactEmailInput}
                              placeholder={t("creatorCardEditor.contact.placeholders.email")}
                              className="bg-slate-950/40 border-white/10 text-slate-100 placeholder:text-slate-400 focus-visible:ring-white/20"
                              onChange={(e) => {
                                setContactEmailInput(e.target.value)
                                markDirty()
                              }}
                              onFocus={() => setActivePreviewSection("contact")}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault()
                                  const next = normalizeStringArray([contactEmailInput], 1)
                                  if (next.length === 0) return
                                  setContactEmails((prev) => normalizeStringArray([...prev, next[0]], 20))
                                  setContactEmailInput("")
                                  markDirty()
                                }
                              }}
                            />
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="shrink-0"
                              onClick={() => {
                                const next = normalizeStringArray([contactEmailInput], 1)
                                if (next.length === 0) return
                                setContactEmails((prev) => normalizeStringArray([...prev, next[0]], 20))
                                setContactEmailInput("")
                                markDirty()
                              }}
                              disabled={!contactEmailInput.trim()}
                            >
                              {t("creatorCardEditor.formats.otherAdd")}
                            </Button>
                          </div>
                        </div>
                      </div>

                      <div className="min-w-0">
                        <div className="text-[11px] font-semibold text-white/55">Instagram</div>
                        {contactInstagrams.length > 0 ? (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {contactInstagrams.map((tag) => (
                              <span
                                key={tag}
                                className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm text-slate-100"
                              >
                                <span className="min-w-0 truncate max-w-[240px]">{tag}</span>
                                <button
                                  type="button"
                                  className="shrink-0 rounded-full p-1 hover:bg-white/10"
                                  onClick={() => {
                                    setContactInstagrams((prev) => prev.filter((x) => x !== tag))
                                    markDirty()
                                  }}
                                  aria-label={t("creatorCardEditor.pastCollaborations.remove")}
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </span>
                            ))}
                          </div>
                        ) : null}
                        <div className="mt-2">
                          <div className="flex flex-col sm:flex-row gap-2 min-w-0">
                            <Input
                              value={contactInstagramInput}
                              placeholder={t("creatorCardEditor.contact.placeholders.instagram")}
                              className="bg-slate-950/40 border-white/10 text-slate-100 placeholder:text-slate-400 focus-visible:ring-white/20"
                              onChange={(e) => {
                                setContactInstagramInput(e.target.value)
                                markDirty()
                              }}
                              onFocus={() => setActivePreviewSection("contact")}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault()
                                  const next = normalizeStringArray([contactInstagramInput], 1)
                                  if (next.length === 0) return
                                  setContactInstagrams((prev) => normalizeStringArray([...prev, next[0]], 20))
                                  setContactInstagramInput("")
                                  markDirty()
                                }
                              }}
                            />
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="shrink-0"
                              onClick={() => {
                                const next = normalizeStringArray([contactInstagramInput], 1)
                                if (next.length === 0) return
                                setContactInstagrams((prev) => normalizeStringArray([...prev, next[0]], 20))
                                setContactInstagramInput("")
                                markDirty()
                              }}
                              disabled={!contactInstagramInput.trim()}
                            >
                              {t("creatorCardEditor.formats.otherAdd")}
                            </Button>
                          </div>
                        </div>
                      </div>

                      <div className="min-w-0">
                        <div className="text-[11px] font-semibold text-white/55">Other</div>
                        {contactOthers.length > 0 ? (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {contactOthers.map((tag) => (
                              <span
                                key={tag}
                                className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm text-slate-100"
                              >
                                <span className="min-w-0 truncate max-w-[240px]">{tag}</span>
                                <button
                                  type="button"
                                  className="shrink-0 rounded-full p-1 hover:bg-white/10"
                                  onClick={() => {
                                    setContactOthers((prev) => prev.filter((x) => x !== tag))
                                    markDirty()
                                  }}
                                  aria-label={t("creatorCardEditor.pastCollaborations.remove")}
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </span>
                            ))}
                          </div>
                        ) : null}
                        <div className="mt-2">
                          <textarea
                            value={contactOtherInput}
                            placeholder={t("creatorCardEditor.contact.placeholders.other")}
                            onChange={(e) => {
                              setContactOtherInput(e.target.value)
                              markDirty()
                            }}
                            onFocus={() => setActivePreviewSection("contact")}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                                e.preventDefault()
                                const next = normalizeStringArray([contactOtherInput], 1)
                                if (next.length === 0) return
                                setContactOthers((prev) => normalizeStringArray([...prev, next[0]], 20))
                                setContactOtherInput("")
                                markDirty()
                              }
                            }}
                            className="w-full min-h-[72px] resize-y rounded-md border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-400 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20"
                          />
                          <div className="mt-2 flex justify-end">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="shrink-0"
                              onClick={() => {
                                const next = normalizeStringArray([contactOtherInput], 1)
                                if (next.length === 0) return
                                setContactOthers((prev) => normalizeStringArray([...prev, next[0]], 20))
                                setContactOtherInput("")
                                markDirty()
                              }}
                              disabled={!contactOtherInput.trim()}
                            >
                              {t("creatorCardEditor.formats.otherAdd")}
                            </Button>
                          </div>
                        </div>
                      </div>
                    </>
                  ),
                },
                {
                  key: "featured",
                  titleZh: "精選貼文",
                  titleEn: "Featured",
                  headerAction: () => (
                    <button
                      type="button"
                      onClick={() => setIsAddIgOpen(v => !v)}
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-md border border-white/15 bg-white/5 hover:bg-white/10 transition-colors"
                      style={{ pointerEvents: 'auto' }}
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>{t("creatorCard.featured.addPost")}</span>
                    </button>
                  ),
                  render: () => (
                    <>
                      {/* Legacy file input - hidden, no longer used for IG-only featured */}
                      <input
                        ref={featuredAddInputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        disabled
                        onChange={async (e) => {
                          const files = Array.from(e.currentTarget.files ?? [])
                          if (!files.length) return
                          e.currentTarget.value = ""

                          for (const file of files) {
                            const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`

                            // show preview instantly
                            const previewUrl = URL.createObjectURL(file)
                            setFeaturedItems((prev) => [
                              ...prev,
                              { id, url: previewUrl, brand: "", collabType: "", uploadStatus: "uploading" },
                            ])
                            markDirty()

                            setFeaturedUploadingIds((prev) => {
                              const next = new Set(prev)
                              next.add(id)
                              return next
                            })

                            try {
                              const formData = new FormData()
                              formData.append("file", file)

                              const res = await fetch("/api/upload/creator-card-portfolio", {
                                method: "POST",
                                body: formData,
                                credentials: "include",
                              })

                              const data = await res.json()

                              if (!res.ok || !data.ok) {
                                const detail = typeof data?.error === "string" ? data.error : ""
                                setFeaturedItems((prev) =>
                                  prev.map((x) => (x.id === id ? { ...x, uploadStatus: "failed" } : x))
                                )
                                showToast(detail ? `${t("creatorCard.form.featured.uploadFailed")} (${detail})` : t("creatorCard.form.featured.uploadFailed"))
                                continue
                              }

                              const uploadedUrl = typeof data?.url === "string" ? data.url : ""

                              if (!uploadedUrl || !isPersistedUrl(uploadedUrl)) {
                                setFeaturedItems((prev) =>
                                  prev.map((x) => (x.id === id ? { ...x, uploadStatus: "failed" } : x))
                                )
                                showToast(t("creatorCard.form.featured.uploadFailed"))
                                continue
                              }

                              // replace preview with persisted url
                              setFeaturedItems((prev) =>
                                prev.map((x) => (x.id === id ? { ...x, url: uploadedUrl, uploadStatus: "idle" } : x))
                              )
                              URL.revokeObjectURL(previewUrl)
                            } catch {
                              setFeaturedItems((prev) =>
                                prev.map((x) => (x.id === id ? { ...x, uploadStatus: "failed" } : x))
                              )
                              showToast(t("creatorCard.form.featured.uploadFailed"))
                            } finally {
                              setFeaturedUploadingIds((prev) => {
                                const next = new Set(prev)
                                next.delete(id)
                                return next
                              })
                            }
                          }
                        }}
                      />

                      <input
                        ref={featuredReplaceInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={async (e) => {
                          const id = pendingFeaturedReplaceIdRef.current
                          const file = e.currentTarget.files?.[0]
                          e.currentTarget.value = ""
                          if (!id || !file) return

                          const previewUrl = URL.createObjectURL(file)
                          const prevUrl =
                            typeof featuredItems.find((x) => x.id === id)?.url === "string"
                              ? (featuredItems.find((x) => x.id === id)!.url as string)
                              : ""

                          // instant preview
                          setFeaturedItems((prev) =>
                            prev.map((x) => (x.id === id ? { ...x, url: previewUrl, uploadStatus: "uploading" } : x))
                          )
                          markDirty()

                          setFeaturedUploadingIds((prev) => {
                            const next = new Set(prev)
                            next.add(id)
                            return next
                          })

                          try {
                            const formData = new FormData()
                            formData.append("file", file)

                            const res = await fetch("/api/upload/creator-card-portfolio", {
                              method: "POST",
                              body: formData,
                              credentials: "include",
                            })

                            const data = await res.json()

                            if (!res.ok || !data.ok) {
                              const detail = typeof data?.error === "string" ? data.error : ""
                              setFeaturedItems((prev) =>
                                prev.map((x) => (x.id === id ? { ...x, url: prevUrl, uploadStatus: "failed" } : x))
                              )
                              URL.revokeObjectURL(previewUrl)
                              showToast(detail ? `${t("creatorCard.form.featured.uploadFailed")} (${detail})` : t("creatorCard.form.featured.uploadFailed"))
                              return
                            }

                            const uploadedUrl = typeof data?.url === "string" ? data.url : ""

                            if (!uploadedUrl || !isPersistedUrl(uploadedUrl)) {
                              setFeaturedItems((prev) =>
                                prev.map((x) => (x.id === id ? { ...x, url: prevUrl, uploadStatus: "failed" } : x))
                              )
                              URL.revokeObjectURL(previewUrl)
                              showToast(t("creatorCard.form.featured.uploadFailed"))
                              return
                            }

                            setFeaturedItems((prev) =>
                              prev.map((x) => (x.id === id ? { ...x, url: uploadedUrl, uploadStatus: "idle" } : x))
                            )
                            URL.revokeObjectURL(previewUrl)
                          } catch {
                            setFeaturedItems((prev) =>
                              prev.map((x) => (x.id === id ? { ...x, url: prevUrl, uploadStatus: "failed" } : x))
                            )
                            URL.revokeObjectURL(previewUrl)
                            showToast(t("creatorCard.form.featured.uploadFailed"))
                          } finally {
                            setFeaturedUploadingIds((prev) => {
                              const next = new Set(prev)
                              next.delete(id)
                              return next
                            })
                          }
                        }}
                      />

                      {featuredItems.some((item) => item.uploadStatus === "failed") && (
                        <div className="mb-3 rounded-lg border border-white/15 bg-black/70 px-3 py-2 text-sm text-white/90">
                          ⚠ 有部分圖片上傳失敗，已保留預覽，請重新上傳或刪除後再試
                        </div>
                      )}

                      <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={(event) => {
                          const { active, over } = event
                          if (!over) return
                          if (active.id === over.id) return
                          setFeaturedItems((prev) => {
                            const oldIndex = prev.findIndex((x) => x.id === active.id)
                            const newIndex = prev.findIndex((x) => x.id === over.id)
                            if (oldIndex < 0 || newIndex < 0) return prev
                            return arrayMove(prev, oldIndex, newIndex)
                          })
                          setSuppressFeaturedTileClick(true)
                          window.setTimeout(() => setSuppressFeaturedTileClick(false), 120)
                        }}
                        onDragCancel={() => {
                          setSuppressFeaturedTileClick(true)
                          window.setTimeout(() => setSuppressFeaturedTileClick(false), 120)
                        }}
                      >
                        <SortableContext items={featuredItems.filter(x => x.type === "ig").map((x) => x.id)}>
                          <div className="relative group/carousel">
                            {canScrollFeaturedLeft && (
                              <button
                                type="button"
                                onClick={() => {
                                  const el = featuredCarouselRef.current
                                  if (!el) return
                                  const firstItem = el.querySelector('[data-carousel-item]')
                                  if (!firstItem) return
                                  const cardWidth = firstItem.getBoundingClientRect().width
                                  el.scrollBy({ left: -(cardWidth + 12), behavior: 'smooth' })
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
                            {canScrollFeaturedRight && (
                              <button
                                type="button"
                                onClick={() => {
                                  const el = featuredCarouselRef.current
                                  if (!el) return
                                  const firstItem = el.querySelector('[data-carousel-item]')
                                  if (!firstItem) return
                                  const cardWidth = firstItem.getBoundingClientRect().width
                                  el.scrollBy({ left: cardWidth + 12, behavior: 'smooth' })
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
                            <div 
                              ref={featuredCarouselRef}
                              id="featured-carousel-container"
                              className="flex gap-3 overflow-x-auto snap-x snap-mandatory scroll-smooth [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden px-10"
                              style={{ scrollPaddingLeft: "0px" }}
                              onScroll={() => {
                                const el = featuredCarouselRef.current
                                if (!el) return
                                setCanScrollFeaturedLeft(el.scrollLeft > 2)
                                setCanScrollFeaturedRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 2)
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                                  e.preventDefault()
                                  const el = featuredCarouselRef.current
                                  if (!el) return
                                  const firstItem = el.querySelector('[data-carousel-item]')
                                  if (!firstItem) return
                                  const cardWidth = firstItem.getBoundingClientRect().width
                                  const delta = e.key === 'ArrowLeft' ? -(cardWidth + 12) : (cardWidth + 12)
                                  el.scrollBy({ left: delta, behavior: 'smooth' })
                                }
                              }}
                              tabIndex={0}
                            >
                              {/* Add IG carousel tile - only shown when isAddIgOpen === true */}
                              {isAddIgOpen && (
                                <div data-carousel-item className="snap-start shrink-0 w-full sm:w-[calc(50%-6px)]">
                                  <div className="relative w-full min-h-[280px] p-4 rounded-2xl border border-white/10 bg-white/5 shadow-sm space-y-3">
                                    <div className="flex items-center justify-between mb-2">
                                      <span className="text-xs font-semibold text-white/60">{t("creatorCard.featured.addPost")}</span>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setIsAddIgOpen(false)
                                          setNewIgUrl("")
                                          setPendingIg(null)
                                        }}
                                        className="rounded-full bg-white/90 p-1 shadow-sm hover:bg-white"
                                        aria-label="Close"
                                      >
                                        <X className="h-3.5 w-3.5 text-slate-700" />
                                      </button>
                                    </div>

                                    <input
                                      type="url"
                                      value={newIgUrl}
                                      onChange={(e) => setNewIgUrl(e.target.value)}
                                      placeholder={t("creatorCard.featured.igUrl")}
                                      className="w-full px-3 py-2.5 text-sm bg-slate-950/40 border border-white/10 rounded-lg text-slate-100 placeholder:text-slate-400 focus-visible:ring-1 focus-visible:ring-white/20 focus:outline-none"
                                      style={{ minHeight: "44px" }}
                                    />

                                    <button
                                      type="button"
                                      onClick={async () => {
                                        const trimmed = newIgUrl.trim()
                                        if (!trimmed) return
                                        
                                        const isValidIg = /instagram\.com\/(p|reel|tv)\//.test(trimmed)
                                        if (!isValidIg) {
                                          showToast(activeLocale === "zh-TW" ? "請輸入有效的 Instagram 貼文連結" : "Please enter a valid Instagram post link")
                                          return
                                        }
                                        
                                        setPendingIg({ url: trimmed, status: "loading" })
                                        
                                        try {
                                          const res = await fetch(`/api/ig/oembed?url=${encodeURIComponent(trimmed)}`)
                                          const data = await res.json()
                                          
                                          if (res.ok && data.ok) {
                                            setPendingIg({ url: trimmed, status: "success", oembed: data })
                                          } else {
                                            setPendingIg({ url: trimmed, status: "error" })
                                          }
                                        } catch (err) {
                                          setPendingIg({ url: trimmed, status: "error" })
                                        }
                                      }}
                                      className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-white/10 border border-white/20 rounded-lg hover:bg-white/15 transition-colors"
                                    >
                                      <span>{activeLocale === "zh-TW" ? "預覽" : "Preview"}</span>
                                    </button>

                                    {pendingIg?.status === "loading" && (
                                      <div
                                        className="relative w-full overflow-hidden rounded-xl border border-white/10 bg-slate-900/60"
                                        style={{ aspectRatio: "4 / 5", maxHeight: "200px" }}
                                      >
                                        <div className="w-full h-full flex flex-col items-center justify-center gap-3 p-6 animate-pulse">
                                          <div className="h-12 w-12 rounded-full bg-white/10" />
                                          <div className="h-3 w-24 rounded bg-white/10" />
                                        </div>
                                      </div>
                                    )}

                                    {pendingIg?.status === "error" && (
                                      <div
                                        className="relative w-full overflow-hidden rounded-xl border border-white/10 bg-slate-900/60 flex flex-col items-center justify-center gap-3 p-6 text-center"
                                        style={{ aspectRatio: "4 / 5", maxHeight: "200px" }}
                                      >
                                        <svg className="w-10 h-10 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                        </svg>
                                        <span className="text-xs leading-tight text-white/60 break-words">
                                          {t("results.mediaKit.featured.previewUnavailable")}
                                        </span>
                                      </div>
                                    )}

                                    {pendingIg?.status === "success" && pendingIg.oembed?.thumbnailUrl && (
                                      <div className="space-y-3">
                                        <div
                                          className="relative w-full overflow-hidden rounded-xl border border-white/10 bg-slate-900/60"
                                          style={{ aspectRatio: "4 / 5", maxHeight: "200px" }}
                                        >
                                          <img
                                            src={pendingIg.oembed.thumbnailUrl}
                                            alt="Instagram post preview"
                                            className="w-full h-full object-cover block"
                                            loading="lazy"
                                            referrerPolicy="no-referrer"
                                            decoding="async"
                                          />
                                        </div>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const id = `ig-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
                                            setFeaturedItems((prev) => [
                                              ...prev,
                                              { id, type: "ig", url: pendingIg.url, brand: "", collabType: "", caption: "", isAdded: true },
                                            ])
                                            setPendingIg(null)
                                            setNewIgUrl("")
                                            setIsAddIgOpen(false)
                                            markDirty()
                                          }}
                                          className="w-full px-4 py-2 text-sm font-semibold text-white bg-gradient-to-r from-purple-500/30 to-pink-500/30 border border-white/20 rounded-lg hover:from-purple-500/40 hover:to-pink-500/40 transition-colors"
                                        >
                                          {t("creatorCard.featured.addPost")}
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}

                              {featuredItems.filter(item => item.type === "ig").map((item) => (
                                <div key={item.id} data-carousel-item className="snap-start shrink-0 w-full sm:w-[calc(50%-6px)]">
                                  <SortableFeaturedTile
                                    item={item}
                                    t={t}
                                    activeLocale={activeLocale}
                                    suppressClick={suppressFeaturedTileClick}
                                    onReplace={(id) => {
                                      pendingFeaturedReplaceIdRef.current = id
                                      featuredReplaceInputRef.current?.click()
                                    }}
                                    onEdit={(id) => {
                                      openEditFeatured(id)
                                    }}
                                    onRemove={(id) => {
                                      setFeaturedItems((prev) => {
                                        const picked = prev.find((x) => x.id === id)
                                        if (picked?.url && picked.url.startsWith("blob:")) URL.revokeObjectURL(picked.url)
                                        return prev.filter((x) => x.id !== id)
                                      })
                                    }}
                                    onCaptionChange={(id, caption) => {
                                      setFeaturedItems((prev) => prev.map((x) => (x.id === id ? { ...x, caption } : x)))
                                      markDirty()
                                    }}
                                    onTextChange={(id, text, title) => {
                                      setFeaturedItems((prev) => prev.map((x) => (x.id === id ? { ...x, text, title } : x)))
                                      markDirty()
                                    }}
                                    onIgUrlChange={(id, url) => {
                                      setFeaturedItems((prev) => prev.map((x) => (x.id === id ? { ...x, url } : x)))
                                      markDirty()
                                    }}
                                    onIgThumbnailClick={(url) => setIgModalUrl(url)}
                                    igOEmbedCache={igOEmbedCache}
                                    onIgOEmbedFetch={(url, data) => {
                                      setIgOEmbedCache((prev) => ({ ...prev, [url]: data }))
                                    }}
                                    setFeaturedItems={setFeaturedItems}
                                    markDirty={markDirty}
                                  />
                                </div>
                              ))}
                              
                              <button
                                type="button"
                                onClick={() => {
                                  window.open("https://www.instagram.com/", "_blank", "noopener,noreferrer")
                                }}
                                className="group relative snap-start shrink-0 w-full sm:w-[calc(50%-6px)] min-h-[120px] overflow-hidden rounded-2xl border border-white/15 bg-white/5 shadow-sm transition-colors hover:border-white/25 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20"
                                aria-label={activeLocale === "zh-TW" ? "開啟Instagram" : "Open Instagram"}
                                title={activeLocale === "zh-TW" ? "開啟Instagram" : "Open Instagram"}
                              >
                                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                                  <svg className="h-7 w-7 text-white/30 group-hover:text-white/45" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M7.8 2h8.4C19.4 2 22 4.6 22 7.8v8.4a5.8 5.8 0 0 1-5.8 5.8H7.8C4.6 22 2 19.4 2 16.2V7.8A5.8 5.8 0 0 1 7.8 2m-.2 2A3.6 3.6 0 0 0 4 7.6v8.8C4 18.39 5.61 20 7.6 20h8.8a3.6 3.6 0 0 0 3.6-3.6V7.6C20 5.61 18.39 4 16.4 4H7.6m9.65 1.5a1.25 1.25 0 0 1 1.25 1.25A1.25 1.25 0 0 1 17.25 8 1.25 1.25 0 0 1 16 6.75a1.25 1.25 0 0 1 1.25-1.25M12 7a5 5 0 0 1 5 5 5 5 0 0 1-5 5 5 5 0 0 1-5-5 5 5 0 0 1 5-5m0 2a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3z"/>
                                  </svg>
                                  <div className="text-[11px] font-semibold text-white/60 group-hover:text-white/75">
                                    {activeLocale === "zh-TW" ? "開啟Instagram" : "Open Instagram"}
                                  </div>
                                </div>
                              </button>
                            </div>
                          </div>
                        </SortableContext>
                      </DndContext>


                      {featuredItems.filter(x => x.type === "ig").length === 0 ? (
                        <div className="mt-2 text-sm text-slate-500">
                          {t("creatorCard.featured.emptyIg")}
                        </div>
                      ) : null}
                    </>
                  ),
                },
                {
                  key: "formats",
                  titleZh: "合作形式",
                  titleEn: "Formats",
                  render: () => (
                    <>
                      <div className="flex flex-wrap gap-2">
                        {formatOptions.map((opt) => {
                          const isActive =
                            opt.id === "other"
                              ? otherFormatEnabled
                              : opt.id === "fb_post"
                                ? deliverables.includes("fb_post") || deliverables.includes("fb") || deliverables.includes("facebook")
                                : deliverables.includes(opt.id)
                          const pillClassName =
                            "h-7 px-2.5 text-xs rounded-full border " +
                            (isActive
                              ? "bg-white/[0.06] border-emerald-400/50 text-white hover:bg-white/[0.09] hover:border-emerald-400/70"
                              : "bg-white/5 border-white/10 text-slate-200 hover:bg-white/10")
                          return (
                            <Button
                              key={opt.id}
                              type="button"
                              variant="pill"
                              active={isActive}
                              className={pillClassName}
                              onClick={() => {
                                if (opt.id === "other") {
                                  setOtherFormatEnabled((prev) => !prev)
                                  flashHighlight("formats")
                                  return
                                }
                                if (opt.id === "fb_post") {
                                  setDeliverables((prev) => {
                                    const hasAny = prev.includes("fb_post") || prev.includes("fb") || prev.includes("facebook")
                                    if (hasAny) return prev.filter((x) => x !== "fb_post" && x !== "fb" && x !== "facebook")
                                    return [...prev, "fb_post"]
                                  })
                                  flashHighlight("formats")
                                  return
                                }

                                setDeliverables((prev) => toggleInArray(prev, opt.id))
                                flashHighlight("formats")
                              }}
                            >
                              {t(opt.labelKey)}
                            </Button>
                          )
                        })}

                        {(() => {
                          const customs = deliverables.filter((x) => !knownCollabTypeIds.has(x))
                          if (customs.length === 0) return null
                          return customs.map((tag) => (
                            <Button
                              key={tag}
                              type="button"
                              variant="pill"
                              active
                              className="h-7 px-2.5 text-xs rounded-full border bg-white/[0.06] border-emerald-400/50 text-white hover:bg-white/[0.09] hover:border-emerald-400/70"
                              onClick={() => {
                                setDeliverables((prev) => prev.filter((x) => x !== tag))
                                flashHighlight("formats")
                                markDirty()
                              }}
                            >
                              {tag}
                            </Button>
                          ))
                        })()}
                      </div>

                      {otherFormatEnabled ? (
                        <div className="mt-3 min-w-0">
                          <div className="flex flex-col sm:flex-row gap-2 min-w-0">
                            <Input
                              value={otherFormatInput}
                              placeholder={t("creatorCardEditor.formats.otherPlaceholder")}
                              className="bg-slate-950/40 border-white/10 text-slate-100 placeholder:text-slate-400 focus-visible:ring-white/20"
                              disabled={!otherFormatEnabled}
                              onChange={(e) => setOtherFormatInput(e.target.value)}
                              onFocus={() => setActivePreviewSection("formats")}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault()
                                  addOtherFormat()
                                }
                              }}
                            />
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="shrink-0"
                              onClick={addOtherFormat}
                              disabled={!otherFormatEnabled || !otherFormatInput.trim()}
                            >
                              {t("creatorCardEditor.formats.otherAdd")}
                            </Button>
                          </div>

                          {null}
                        </div>
                      ) : null}
                    </>
                  ),
                },
                {
                  key: "niches",
                  titleZh: "合作品類",
                  titleEn: "Niches",
                  render: () => (
                    <>
                      <div className="flex flex-wrap gap-2">
                        {nicheOptions.map((opt) => {
                          const isActive = collaborationNiches.includes(opt.id)
                          const pillClassName =
                            "h-7 px-2.5 text-xs rounded-full border " +
                            (isActive
                              ? "bg-white/[0.06] border-emerald-400/50 text-white hover:bg-white/[0.09] hover:border-emerald-400/70"
                              : "bg-white/5 border-white/10 text-slate-200 hover:bg-white/10")
                          return (
                            <Button
                              key={opt.id}
                              type="button"
                              variant="pill"
                              active={isActive}
                              className={pillClassName}
                              onClick={() => {
                                setCollaborationNiches((prev) => toggleInArray(prev, opt.id))
                                flashHighlight("niches")
                              }}
                            >
                              {t(opt.labelKey)}
                            </Button>
                          )
                        })}
                        <Button
                          type="button"
                          variant="pill"
                          active={otherNicheEnabled}
                          className={
                            "h-7 px-2.5 text-xs rounded-full border " +
                            (otherNicheEnabled
                              ? "bg-white/[0.06] border-emerald-400/50 text-white hover:bg-white/[0.09] hover:border-emerald-400/70"
                              : "bg-white/5 border-white/10 text-slate-200 hover:bg-white/10")
                          }
                          onClick={() => {
                            setOtherNicheEnabled((prev) => !prev)
                            flashHighlight("niches")
                          }}
                        >
                          {t("creatorCardEditor.formats.options.other")}
                        </Button>
                      </div>

                      {otherNicheEnabled ? (
                        <div className="mt-3 min-w-0">
                          <div className="flex flex-col sm:flex-row gap-2 min-w-0">
                            <Input
                              value={otherNicheInput}
                              placeholder="Enter other niche"
                              className="bg-slate-950/40 border-white/10 text-slate-100 placeholder:text-slate-400 focus-visible:ring-white/20"
                              disabled={!otherNicheEnabled}
                              onChange={(e) => setOtherNicheInput(e.target.value)}
                              onFocus={() => setActivePreviewSection("collaborationNiches")}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault()
                                  addOtherNiche()
                                }
                              }}
                            />
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="shrink-0"
                              onClick={addOtherNiche}
                              disabled={!otherNicheEnabled || !otherNicheInput.trim()}
                            >
                              {t("creatorCardEditor.formats.otherAdd")}
                            </Button>
                          </div>

                          {(() => {
                            const customs = collaborationNiches.filter((x) => !knownNicheIds.has(x))
                            if (customs.length === 0) return null
                            return (
                              <div className="mt-2 flex flex-wrap gap-2">
                                {customs.map((tag) => (
                                  <span
                                    key={tag}
                                    className="inline-flex items-center gap-1 rounded-full border border-emerald-400/50 bg-white/[0.06] px-3 py-1 text-sm text-white"
                                  >
                                    <span className="min-w-0 truncate max-w-[240px]">{tag}</span>
                                    <button
                                      type="button"
                                      className="shrink-0 rounded-full p-1 hover:bg-white/10"
                                      onClick={() => {
                                        setCollaborationNiches((prev) => prev.filter((x) => x !== tag))
                                        flashHighlight("niches")
                                      }}
                                      aria-label={t("creatorCardEditor.pastCollaborations.remove")}
                                    >
                                      <X className="h-3.5 w-3.5" />
                                    </button>
                                  </span>
                                ))}
                              </div>
                            )
                          })()}
                        </div>
                      ) : null}
                    </>
                  ),
                },
                {
                  key: "brands",
                  titleZh: "過往合作",
                  titleEn: "Past Collabs",
                  render: () => (
                    <>
                      <div className="flex flex-wrap gap-2">
                        {pastCollaborations.map((tag) => (
                          <span
                            key={tag}
                            className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm text-slate-100"
                          >
                            <span className="min-w-0 truncate max-w-[240px]">{tag}</span>
                            <button
                              type="button"
                              className="shrink-0 rounded-full p-1 hover:bg-white/10"
                              onClick={() => {
                                setPastCollaborations((prev) => prev.filter((x) => x !== tag))
                                flashHighlight("brands")
                              }}
                              aria-label={t("creatorCardEditor.pastCollaborations.remove")}
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </span>
                        ))}
                      </div>

                      <div className="mt-3">
                        <div className="flex flex-col sm:flex-row gap-2 min-w-0">
                          <Input
                            ref={(node) => {
                              brandInputRef.current = node
                            }}
                            value={pastCollabInput}
                            placeholder={t("creatorCardEditor.pastCollaborations.placeholder")}
                            className="bg-slate-950/40 border-white/10 text-slate-100 placeholder:text-slate-400 focus-visible:ring-white/20"
                            onChange={(e) => {
                              setPastCollabInput(e.target.value)
                              markDirty()
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault()
                                addPastCollab()
                                return
                              }
                              if (e.key === "Backspace" && !pastCollabInput.trim()) {
                                setPastCollaborations((prev) => prev.slice(0, Math.max(0, prev.length - 1)))
                                flashHighlight("brands")
                                markDirty()
                              }
                            }}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="shrink-0"
                            onClick={() => {
                              addPastCollab()
                            }}
                            disabled={!pastCollabInput.trim()}
                          >
                            {t("creatorCardEditor.formats.otherAdd")}
                          </Button>
                        </div>
                        <div className="mt-2 text-xs text-slate-500">{brandHelperText}</div>
                      </div>
                    </>
                  ),
                },
              ]

              return (
                <>
                  <div className="lg:hidden">
                    {(() => {
                      const formatsSection = sections.find((s) => s.key === "formats")
                      const nichesSection = sections.find((s) => s.key === "niches")
                      const featuredSection = sections.find((s) => s.key === "featured")
                      const contactSection = sections.find((s) => s.key === "contact")
                      const brandsSection = sections.find((s) => s.key === "brands")

                      const mobileSections: Array<{
                        key: string
                        titleKey: string
                        render: () => ReactNode
                      }> = [
                        {
                          key: "profile",
                          titleKey: "creatorCardEditor.mobile.sections.profile",
                          render: () => (
                            <div className="space-y-4">
                              <div className="min-w-0">
                                <div className="text-[12px] font-semibold text-white/55">{t("creatorCardEditor.profile.bioTitle")}</div>
                                <div className="mt-2">
                                  <textarea
                                    value={introDraft}
                                    placeholder={t("creatorCardEditor.profile.bioPlaceholder")}
                                    onChange={(e) => setIntroDraft(e.target.value)}
                                    onFocus={() => setActivePreviewSection("about")}
                                    className="w-full min-h-[120px] resize-y rounded-md border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-400 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20"
                                  />
                                </div>
                              </div>

                              <div className="min-w-0">
                                <div className="flex items-center gap-2 min-w-0">
                                  <div className="text-[12px] font-semibold text-white/55 min-w-0 whitespace-normal break-words [overflow-wrap:anywhere]">{t("creatorCardEditor.profile.themeTitle")}</div>
                                  <div className="ml-auto shrink-0">
                                    {!mobileShowThemeAdd ? (
                                      <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => setMobileShowThemeAdd(true)}>
                                        {t("creatorCardEditor.formats.otherAdd")}
                                      </Button>
                                    ) : null}
                                  </div>
                                </div>

                                {mobileShowThemeAdd ? (
                                  <div className="mt-2 flex gap-2 min-w-0">
                                    <Input
                                      ref={mobileThemeInputRef}
                                      value={themeTypeInput}
                                      placeholder={t("creatorCardEditor.profile.themePlaceholder")}
                                      className="bg-slate-950/40 border-white/10 text-slate-100 placeholder:text-slate-400 focus-visible:ring-white/20"
                                      onChange={(e) => setThemeTypeInput(e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                          e.preventDefault()
                                          addThemeTypeTag(themeTypeInput)
                                          setThemeTypeInput("")
                                          setMobileShowThemeAdd(false)
                                          markDirty()
                                        }
                                      }}
                                    />
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      className="shrink-0"
                                      onClick={() => {
                                        addThemeTypeTag(themeTypeInput)
                                        setThemeTypeInput("")
                                        setMobileShowThemeAdd(false)
                                        markDirty()
                                      }}
                                      disabled={!themeTypeInput.trim()}
                                    >
                                      {t("creatorCardEditor.mobile.actions.ok")}
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      className="shrink-0"
                                      onClick={() => {
                                        setMobileShowThemeAdd(false)
                                        setThemeTypeInput("")
                                      }}
                                    >
                                      {t("creatorCardEditor.mobile.actions.cancel")}
                                    </Button>
                                  </div>
                                ) : null}

                                {themeTypes.length > 0 ? (
                                  <div className="mt-2">
                                    <div
                                      ref={themeChipOverflow.containerRef}
                                      className={
                                        "flex flex-wrap gap-2 " + (themeChipOverflow.expanded ? "" : "max-h-[64px] overflow-hidden")
                                      }
                                    >
                                      {themeTypes.map((tag) => (
                                        <button
                                          key={tag}
                                          ref={themeChipOverflow.setChipRef(tag)}
                                          type="button"
                                          onClick={() => {
                                            setThemeTypes((prev) => prev.filter((x) => x !== tag))
                                            markDirty()
                                          }}
                                          className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-slate-100 hover:bg-white/10"
                                        >
                                          <span className="min-w-0 truncate max-w-[240px]">{tag}</span>
                                          <span className="ml-1.5 text-slate-400" aria-hidden="true">×</span>
                                        </button>
                                      ))}
                                    </div>

                                    {themeChipOverflow.canToggle ? (
                                      <button
                                        type="button"
                                        className="mt-2 -mx-2 inline-flex min-w-0 items-center rounded-md px-2 py-2 text-left text-xs font-semibold text-white/70 hover:bg-white/5 whitespace-normal break-words [overflow-wrap:anywhere]"
                                        onClick={() => themeChipOverflow.setExpanded((prev) => !prev)}
                                      >
                                        {themeChipOverflow.expanded
                                          ? t("creatorCardEditor.mobile.chips.showLess")
                                          : t("creatorCardEditor.mobile.chips.showAll")}
                                      </button>
                                    ) : null}
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          ),
                        },
                        {
                          key: "audience",
                          titleKey: "creatorCardEditor.mobile.sections.audience",
                          render: () => (
                            <div className="space-y-4">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 min-w-0">
                                  <div className="text-[12px] font-semibold text-white/55 min-w-0 whitespace-normal break-words [overflow-wrap:anywhere]">{t("creatorCardEditor.profile.audienceTitle")}</div>
                                  <div className="ml-auto shrink-0">
                                    {!mobileShowAudienceAdd ? (
                                      <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => setMobileShowAudienceAdd(true)}>
                                        {t("creatorCardEditor.formats.otherAdd")}
                                      </Button>
                                    ) : null}
                                  </div>
                                </div>

                                {mobileShowAudienceAdd ? (
                                  <div className="mt-2 flex gap-2 min-w-0">
                                    <Input
                                      ref={mobileAudienceInputRef}
                                      value={audienceProfileInput}
                                      placeholder={t("creatorCardEditor.profile.audiencePlaceholder")}
                                      className="bg-slate-950/40 border-white/10 text-slate-100 placeholder:text-slate-400 focus-visible:ring-white/20"
                                      onChange={(e) => setAudienceProfileInput(e.target.value)}
                                      onFocus={() => setActivePreviewSection("audienceSummary")}
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                          e.preventDefault()
                                          addAudienceProfileTag(audienceProfileInput)
                                          setAudienceProfileInput("")
                                          setMobileShowAudienceAdd(false)
                                          markDirty()
                                        }
                                      }}
                                    />
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      className="shrink-0"
                                      onClick={() => {
                                        addAudienceProfileTag(audienceProfileInput)
                                        setAudienceProfileInput("")
                                        setMobileShowAudienceAdd(false)
                                        markDirty()
                                      }}
                                      disabled={!audienceProfileInput.trim()}
                                    >
                                      {t("creatorCardEditor.mobile.actions.ok")}
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      className="shrink-0"
                                      onClick={() => {
                                        setMobileShowAudienceAdd(false)
                                        setAudienceProfileInput("")
                                      }}
                                    >
                                      {t("creatorCardEditor.mobile.actions.cancel")}
                                    </Button>
                                  </div>
                                ) : null}

                                {audienceProfiles.length > 0 ? (
                                  <div className="mt-2">
                                    <div
                                      ref={audienceChipOverflow.containerRef}
                                      className={
                                        "flex flex-wrap gap-2 " + (audienceChipOverflow.expanded ? "" : "max-h-[64px] overflow-hidden")
                                      }
                                    >
                                      {audienceProfiles.map((tag) => (
                                        <button
                                          key={tag}
                                          ref={audienceChipOverflow.setChipRef(tag)}
                                          type="button"
                                          onClick={() => {
                                            setAudienceProfiles((prev) => prev.filter((x) => x !== tag))
                                            markDirty()
                                          }}
                                          className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-slate-100 hover:bg-white/10"
                                        >
                                          <span className="min-w-0 truncate max-w-[240px]">{tag}</span>
                                          <span className="ml-1.5 text-slate-400" aria-hidden="true">×</span>
                                        </button>
                                      ))}
                                    </div>

                                    {audienceChipOverflow.canToggle ? (
                                      <button
                                        type="button"
                                        className="mt-2 -mx-2 inline-flex min-w-0 items-center rounded-md px-2 py-2 text-left text-xs font-semibold text-white/70 hover:bg-white/5 whitespace-normal break-words [overflow-wrap:anywhere]"
                                        onClick={() => audienceChipOverflow.setExpanded((prev) => !prev)}
                                      >
                                        {audienceChipOverflow.expanded
                                          ? t("creatorCardEditor.mobile.chips.showLess")
                                          : t("creatorCardEditor.mobile.chips.showAll")}
                                      </button>
                                    ) : null}
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          ),
                        },
                        {
                          key: "contact",
                          titleKey: "creatorCardEditor.mobile.sections.contact",
                          render: () =>
                            contactSection ? (
                              <div className="space-y-2">{contactSection.render()}</div>
                            ) : (
                              <div className="text-sm text-white/60">{t("creatorCardEditor.common.select")}</div>
                            ),
                        },
                        {
                          key: "featured",
                          titleKey: "creatorCardEditor.mobile.sections.featured",
                          render: () =>
                            featuredSection ? (
                              <div className="space-y-2">{featuredSection.render()}</div>
                            ) : (
                              <div className="text-sm text-white/60">{t("creatorCardEditor.common.select")}</div>
                            ),
                        },
                        {
                          key: "formats",
                          titleKey: "creatorCardEditor.mobile.sections.formats",
                          render: () =>
                            formatsSection ? (
                              <div className="space-y-2">{formatsSection.render()}</div>
                            ) : (
                              <div className="text-sm text-white/60">{t("creatorCardEditor.common.select")}</div>
                            ),
                        },
                        {
                          key: "niches",
                          titleKey: "creatorCardEditor.mobile.sections.niches",
                          render: () =>
                            nichesSection ? (
                              <div className="space-y-2">{nichesSection.render()}</div>
                            ) : (
                              <div className="text-sm text-white/60">{t("creatorCardEditor.common.select")}</div>
                            ),
                        },
                        {
                          key: "brands",
                          titleKey: "creatorCardEditor.mobile.sections.pastCollaborations",
                          render: () =>
                            brandsSection ? (
                              <div className="space-y-2">{brandsSection.render()}</div>
                            ) : (
                              <div className="text-sm text-white/60">{t("creatorCardEditor.common.select")}</div>
                            ),
                        },
                      ]

                      return (
                        <>
                          {isMobile ? (
                            <div className="rounded-xl border border-white/10 bg-slate-900/40 p-3">
                              <Button
                                type="button"
                                variant="outline"
                                className="w-full min-w-0 whitespace-normal break-words [overflow-wrap:anywhere]"
                                aria-label={t("creatorCardEditor.mobile.preview.ariaLabel")}
                                onClick={(e) => {
                                  mobilePreviewTriggerRef.current = e.currentTarget
                                  setMobilePreviewOpen(true)
                                }}
                              >
                                <Eye className="mr-2 h-4 w-4 shrink-0" />
                                <span className="min-w-0 whitespace-normal break-words [overflow-wrap:anywhere]">
                                  {t("creatorCardEditor.mobile.actions.previewCard")}
                                </span>
                              </Button>
                              <div className="mt-2 text-xs text-white/60 min-w-0 whitespace-normal break-words [overflow-wrap:anywhere]">
                                {t("creatorCardEditor.mobile.previewHint")}
                              </div>
                            </div>
                          ) : null}

                          <div className={(isMobile ? "mt-4" : "") + " w-full"}>
                            <Accordion type="multiple" defaultValue={["profile"]} className="w-full">
                              {mobileSections.map((s) => (
                                <AccordionItem
                                  key={s.key}
                                  value={s.key}
                                  className="mt-3 overflow-hidden rounded-xl border border-white/10 bg-slate-900/40"
                                >
                                  <AccordionTrigger className="group min-h-12 px-3 py-3 text-left transition-colors hover:bg-white/5 data-[state=open]:bg-white/[0.06]">
                                    <div className="flex w-full min-w-0 items-center gap-2">
                                      <span className="min-w-0 whitespace-normal break-words [overflow-wrap:anywhere]">
                                        {t(s.titleKey)}
                                      </span>
                                      <ChevronDown className="ml-auto h-4 w-4 shrink-0 text-white/60 transition-transform duration-200 group-data-[state=open]:rotate-180 group-data-[state=open]:text-white/80" />
                                    </div>
                                  </AccordionTrigger>
                                  <AccordionContent className="px-3 pb-3">
                                    <div className="space-y-2">{s.render()}</div>
                                  </AccordionContent>
                                </AccordionItem>
                              ))}
                            </Accordion>
                          </div>

                          {isMobile ? (
                            <div
                              className="fixed left-0 right-0 bottom-0 z-50 border-t border-white/10 bg-slate-950/80 backdrop-blur"
                              style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 12px)" }}
                            >
                              <div className="mx-auto w-full max-w-6xl px-4 pt-3">
                                <div className="flex items-center gap-3">
                                  <Button
                                    type="button"
                                    variant="primary"
                                    className="flex-1 min-w-0 whitespace-normal break-words [overflow-wrap:anywhere]"
                                    onClick={handleSave}
                                    disabled={saving || loading || loadErrorKind === "not_connected" || loadErrorKind === "supabase_invalid_key" || featuredUploadingIds.size > 0}
                                  >
                                    {saving ? <Loader2 className="size-4 animate-spin" /> : null}
                                    {saving ? t("creatorCardEditor.actions.saving") : t("creatorCardEditor.actions.save")}
                                  </Button>
                                </div>
                              </div>
                            </div>
                          ) : null}
                        </>
                      )
                    })()}
                  </div>

                  <div className="hidden lg:block">
                    <div className="space-y-4">
                      {sections.map((s) => (
                        <Card key={s.key} className="overflow-hidden rounded-xl border border-white/10 bg-slate-900/40">
                          <CardHeader className="px-4 pt-3 lg:px-6 lg:pt-4 pb-2">
                            <div className="flex items-start gap-3 min-w-0">
                              <CardTitle className="text-[14px] font-semibold text-white/70 min-w-0 truncate">
                                {s.titleZh} / {s.titleEn}
                              </CardTitle>
                              {s.key === "formats" ? (
                                <span
                                  title={formatsSummary.title}
                                  className="ml-auto min-w-0 max-w-[220px] truncate text-[12px] font-medium text-slate-500"
                                >
                                  {formatsSummary.text}
                                </span>
                              ) : null}
                              {s.key === "niches" ? (
                                <span
                                  title={nichesSummary.title}
                                  className="ml-auto min-w-0 max-w-[220px] truncate text-[12px] font-medium text-slate-500"
                                >
                                  {nichesSummary.text}
                                </span>
                              ) : null}
                              {s.headerAction ? (
                                <div className="ml-auto shrink-0">
                                  {s.headerAction()}
                                </div>
                              ) : null}
                            </div>
                          </CardHeader>
                          <CardContent className="px-4 pb-4 lg:px-6 lg:pb-5">
                            <div className="space-y-2.5">{s.render()}</div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                </>
              )
            })()}
          </div>

          <div className="lg:col-span-7 min-w-0">
            {isMobile ? null : (
              <div className="lg:sticky lg:top-24">
                <CreatorCardPreview
                  t={t}
                  className="border-white/10 bg-transparent"
                  headerClassName="px-3 py-2 sm:px-4 sm:py-2 lg:px-6 lg:py-3 border-b border-white/10"
                  useWidePhotoLayout
                  photoUploadEnabled
                  onProfileImageFileChange={(file) => {
                    setProfileImageFile(file)
                    markDirty()
                  }}
                  username={displayUsername || null}
                  profileImageUrl={(() => {
                    const u1 = typeof baseCard?.profileImageUrl === "string" ? String(baseCard.profileImageUrl) : ""
                    const u2 = typeof igProfile?.profile_picture_url === "string" ? String(igProfile.profile_picture_url) : ""
                    const u = (u1 || u2).trim()
                    return u ? u : null
                  })()}
                  displayName={displayName}
                  aboutText={baseCard?.audience ?? null}
                  primaryNiche={baseCard?.niche ?? null}
                  contact={previewContact}
                  featuredItems={featuredItems}
                  featuredImageUrls={featuredItems.map((x) => x.url)}
                  igOEmbedCache={igOEmbedCache}
                  themeTypes={themeTypes}
                  audienceProfiles={audienceProfiles}
                  collaborationNiches={collaborationNiches}
                  deliverables={deliverables}
                  pastCollaborations={pastCollaborations}
                  followersText={followersText}
                  postsText={postsText}
                  engagementRateText={engagementRateText}
                  highlightTarget={highlight}
                  highlightSection={activePreviewSection}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {__overlayMounted && mobilePreviewOpen
        ? createPortal(
            <div
              className="fixed inset-0 z-50"
              role="dialog"
              aria-modal="true"
              aria-label={t("creatorCardEditor.mobile.preview.ariaLabel")}
            >
              <div
                className="absolute inset-0 bg-black/60"
                onClick={closeMobilePreview}
              />
              <div
                ref={mobilePreviewModalRef}
                tabIndex={-1}
                className="absolute inset-0 flex flex-col focus:outline-none"
              >
                <div className="shrink-0 px-4 pt-4">
                  <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-slate-900/80 px-4 py-3 backdrop-blur">
                    <div className="min-w-0 text-sm font-semibold text-white/85 break-words [overflow-wrap:anywhere]">
                      {t("creatorCardEditor.mobile.preview.title")}
                    </div>
                    <button
                      type="button"
                      onClick={closeMobilePreview}
                      className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/80"
                    >
                      {t("creatorCardEditor.mobile.actions.close")}
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto px-4 pb-6 pt-3">
                  <CreatorCardPreview
                    t={t}
                    className="border-white/10 bg-transparent"
                    headerClassName="px-3 py-2 sm:px-4 sm:py-2 lg:px-6 lg:py-3 border-b border-white/10"
                    useWidePhotoLayout={false}
                    photoUploadEnabled={false}
                    onProfileImageFileChange={undefined}
                    username={displayUsername || null}
                    profileImageUrl={(() => {
                      const u1 = typeof baseCard?.profileImageUrl === "string" ? String(baseCard.profileImageUrl) : ""
                      const u2 = typeof igProfile?.profile_picture_url === "string" ? String(igProfile.profile_picture_url) : ""
                      const u = (u1 || u2).trim()
                      return u ? u : null
                    })()}
                    displayName={displayName}
                    aboutText={baseCard?.audience ?? null}
                    primaryNiche={baseCard?.niche ?? null}
                    contact={previewContact}
                    featuredItems={featuredItems}
                    featuredImageUrls={featuredItems.map((x) => x.url)}
                    igOEmbedCache={igOEmbedCache}
                    themeTypes={themeTypes}
                    audienceProfiles={audienceProfiles}
                    collaborationNiches={collaborationNiches}
                    deliverables={deliverables}
                    pastCollaborations={pastCollaborations}
                    followersText={followersText}
                    postsText={postsText}
                    engagementRateText={engagementRateText}
                    highlightTarget={null}
                    highlightSection={null}
                  />
                </div>
              </div>
            </div>,
            document.body
          )
        : null}

      {__overlayMounted && editingFeaturedId
        ? createPortal(
            <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
              <div
                className="absolute inset-0 bg-black/40"
                onClick={() => {
                  setEditingFeaturedId(null)
                }}
              />
              <div className="relative z-10 w-full max-w-sm rounded-xl border border-slate-200 bg-white p-4 shadow-xl">
                <div className="mb-2 text-sm font-semibold text-slate-900">合作形式</div>
                <div className="mt-3">
                  <Input
                    value={editingFeaturedBrand}
                    placeholder={t("creatorCardEditor.pastCollaborations.placeholder")}
                    onChange={(e) => setEditingFeaturedBrand(e.target.value)}
                  />
                </div>

                <div className="mt-3">
                  <select
                    value={editingFeaturedCollabTypeSelect}
                    onChange={(e) => {
                      const next = e.target.value
                      setEditingFeaturedCollabTypeSelect(next)
                      if (next !== COLLAB_TYPE_OTHER_VALUE) {
                        setEditingFeaturedCollabTypeCustom("")
                      }
                    }}
                    className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950/20"
                  >
                    {COLLAB_TYPE_OPTIONS.map((id) => {
                      const label = t(collabTypeLabelKey(id))
                      return (
                        <option key={id} value={id}>
                          {label}
                        </option>
                      )
                    })}
                    <option value={COLLAB_TYPE_OTHER_VALUE}>{t("creatorCardEditor.formats.options.other")}</option>
                  </select>
                </div>

                {editingFeaturedCollabTypeSelect === COLLAB_TYPE_OTHER_VALUE ? (
                  <div className="mt-2">
                    <Input value={editingFeaturedCollabTypeCustom} onChange={(e) => setEditingFeaturedCollabTypeCustom(e.target.value)} />
                  </div>
                ) : null}

                <div className="mt-5 flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setEditingFeaturedId(null)
                    }}
                  >
                    {t("creatorCardEditor.actions.back")}
                  </Button>
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={() => {
                      const id = editingFeaturedId
                      if (!id) return
                      const nextCollabType =
                        editingFeaturedCollabTypeSelect === COLLAB_TYPE_OTHER_VALUE
                          ? editingFeaturedCollabTypeCustom.trim()
                          : editingFeaturedCollabTypeSelect
                      setFeaturedItems((prev) =>
                        prev.map((x) => (x.id === id ? { ...x, brand: editingFeaturedBrand, collabType: nextCollabType } : x))
                      )
                      markDirty()
                      setEditingFeaturedId(null)
                    }}
                  >
                    {t("creatorCardEditor.actions.save")}
                  </Button>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}

      {/* IG Post Full-Screen Modal */}
      {__overlayMounted && igModalUrl
        ? createPortal(
            <div
              className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-6"
              onClick={() => setIgModalUrl(null)}
            >
              <div
                className="w-full max-w-[720px] h-[96vh] sm:h-auto sm:max-h-[94vh] rounded-2xl border border-white/10 bg-slate-900/95 backdrop-blur shadow-2xl flex flex-col"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Header */}
                <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-white/10 shrink-0">
                  <h3 className="text-sm font-semibold text-white/90">
                    {t("creatorCard.featured.igPreviewTitle")}
                  </h3>
                  <button
                    type="button"
                    onClick={() => setIgModalUrl(null)}
                    className="shrink-0 rounded-full bg-white/10 p-2 hover:bg-white/20 transition-colors"
                    aria-label="Close"
                  >
                    <X className="h-4 w-4 text-white/90" />
                  </button>
                </div>

                {/* Body with full embed */}
                <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-6">
                  <div className="w-full max-w-full">
                    <IgEmbedPreview url={igModalUrl} />
                  </div>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </main>
  )
}
