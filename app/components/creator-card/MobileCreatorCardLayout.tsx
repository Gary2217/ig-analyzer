"use client"

import { useState, useRef, useEffect } from "react"
import Image from "next/image"

interface MobileCreatorCardLayoutProps {
  t: (key: string) => string
  profileImageUrl?: string | null
  displayName?: string | null
  username?: string | null
  aboutText?: string | null
  primaryNiche?: string | null
  audienceSummary?: string | null
  collaborationNiches?: string | null
  formats?: Array<{ id: string; label: string }>
  brands?: string[]
  contact?: { email?: string; other?: string }
  featuredItems?: Array<{
    id: string
    url: string
    thumbnailUrl?: string | null
    brand?: string | null
    collabType?: string | null
  }>
  onOpenIg?: (item: { url: string; thumb?: string }) => void
}

export function MobileCreatorCardLayout({
  t,
  profileImageUrl,
  displayName,
  username,
  aboutText,
  primaryNiche,
  audienceSummary,
  collaborationNiches,
  formats = [],
  brands = [],
  contact,
  featuredItems = [],
  onOpenIg,
}: MobileCreatorCardLayoutProps) {
  const [activeIndex, setActiveIndex] = useState(0)
  const carouselRef = useRef<HTMLDivElement>(null)

  // Track scroll position for pagination
  useEffect(() => {
    const el = carouselRef.current
    if (!el || featuredItems.length === 0) return

    const handleScroll = () => {
      const scrollLeft = el.scrollLeft
      const itemWidth = el.clientWidth
      const index = Math.round(scrollLeft / itemWidth)
      setActiveIndex(Math.max(0, Math.min(index, featuredItems.length - 1)))
    }

    el.addEventListener('scroll', handleScroll, { passive: true })
    return () => el.removeEventListener('scroll', handleScroll)
  }, [featuredItems.length])

  const scrollToSlide = (index: number) => {
    const el = carouselRef.current
    if (!el) return
    const slideWidth = el.clientWidth
    el.scrollTo({ left: slideWidth * index, behavior: 'smooth' })
  }

  const hasContact = contact?.email || contact?.other

  return (
    <div className="flex flex-col gap-4 min-w-0">
      {/* Mobile Profile Header Row */}
      <div className="flex items-center gap-3 min-w-0">
        {/* Circular Avatar */}
        <div className="shrink-0">
          {profileImageUrl ? (
            <div className="relative w-16 h-16 rounded-full overflow-hidden border-2 border-white/10 bg-black/20">
              <Image
                src={profileImageUrl}
                alt={displayName || username || "Profile"}
                fill
                className="object-cover"
                sizes="64px"
                unoptimized
                referrerPolicy="no-referrer"
              />
            </div>
          ) : (
            <div className="w-16 h-16 rounded-full border-2 border-white/10 bg-black/20 flex items-center justify-center">
              <span className="text-white/30 text-xs">—</span>
            </div>
          )}
        </div>

        {/* Username & Handle */}
        <div className="flex-1 min-w-0">
          <div className="text-lg font-bold text-white/90 truncate">
            {displayName || username || "—"}
          </div>
          <div className="text-sm text-white/55 truncate">
            @{username || "—"}
          </div>
        </div>
      </div>

      {/* Personal Showcase Carousel - Full Width */}
      {featuredItems.length > 0 && (
        <div className="min-w-0 -mx-4">
          <div className="px-4 mb-2">
            <div className="text-xs font-semibold text-white/70">
              {t("results.mediaKit.highlights.title")}
            </div>
          </div>
          
          <div className="relative">
            <style jsx>{`
              .carousel-scroller::-webkit-scrollbar {
                display: none;
              }
            `}</style>
            <div
              ref={carouselRef}
              className="carousel-scroller flex overflow-x-auto snap-x snap-mandatory min-w-0"
              style={{
                scrollbarWidth: 'none',
                msOverflowStyle: 'none',
                WebkitOverflowScrolling: 'touch',
              }}
            >
              {featuredItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onOpenIg?.({ url: item.url, thumb: item.thumbnailUrl || undefined })}
                  className="shrink-0 w-full snap-start overflow-hidden focus:outline-none focus:ring-2 focus:ring-white/20 relative px-4"
                  style={{ height: '60vh', maxHeight: '520px' }}
                >
                  <div className="w-full h-full rounded-2xl border border-white/10 bg-black/20 overflow-hidden relative">
                    {item.thumbnailUrl ? (
                      <Image
                        src={item.thumbnailUrl}
                        alt="Showcase"
                        fill
                        className="object-cover"
                        sizes="(max-width: 640px) 100vw, 560px"
                        unoptimized
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-white/30">
                        <svg className="w-12 h-12" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M7.8 2h8.4C19.4 2 22 4.6 22 7.8v8.4a5.8 5.8 0 0 1-5.8 5.8H7.8C4.6 22 2 19.4 2 16.2V7.8A5.8 5.8 0 0 1 7.8 2m-.2 2A3.6 3.6 0 0 0 4 7.6v8.8C4 18.39 5.61 20 7.6 20h8.8a3.6 3.6 0 0 0 3.6-3.6V7.6C20 5.61 18.39 4 16.4 4H7.6m9.65 1.5a1.25 1.25 0 0 1 1.25 1.25A1.25 1.25 0 0 1 17.25 8 1.25 1.25 0 0 1 16 6.75a1.25 1.25 0 0 1 1.25-1.25M12 7a5 5 0 0 1 5 5 5 5 0 0 1-5 5 5 5 0 0 1-5-5 5 5 0 0 1 5-5m0 2a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3z"/>
                        </svg>
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>

            {/* Left/Right Hint Arrows */}
            {featuredItems.length > 1 && (
              <>
                {activeIndex > 0 && (
                  <button
                    type="button"
                    onClick={() => scrollToSlide(activeIndex - 1)}
                    className="absolute left-6 top-1/2 -translate-y-1/2 z-10 flex items-center justify-center w-11 h-11 rounded-full bg-black/60 backdrop-blur-sm text-white/90 hover:bg-black/75 transition-all shadow-lg"
                    style={{ minWidth: '44px', minHeight: '44px' }}
                    aria-label={t("results.mediaKit.highlights.title").includes("精選") ? "上一張" : "Previous"}
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                )}
                {activeIndex < featuredItems.length - 1 && (
                  <button
                    type="button"
                    onClick={() => scrollToSlide(activeIndex + 1)}
                    className="absolute right-6 top-1/2 -translate-y-1/2 z-10 flex items-center justify-center w-11 h-11 rounded-full bg-black/60 backdrop-blur-sm text-white/90 hover:bg-black/75 transition-all shadow-lg"
                    style={{ minWidth: '44px', minHeight: '44px' }}
                    aria-label={t("results.mediaKit.highlights.title").includes("精選") ? "下一張" : "Next"}
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                )}
              </>
            )}

            {/* Pagination Dots */}
            {featuredItems.length > 1 && (
              <div className="flex justify-center gap-1.5 mt-3">
                {featuredItems.map((_, index) => (
                  <div
                    key={index}
                    className={`h-1.5 rounded-full transition-all ${
                      index === activeIndex
                        ? 'w-6 bg-white/70'
                        : 'w-1.5 bg-white/25'
                    }`}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* About Section */}
      {aboutText && (
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4 min-w-0">
          <div className="text-xs font-semibold text-white/55 mb-2">
            {t("results.mediaKit.about.title")}
          </div>
          <p className="text-sm text-white/85 leading-relaxed break-words whitespace-pre-wrap">
            {aboutText}
          </p>
        </div>
      )}

      {/* Brands - Moved directly under About */}
      {brands.length > 0 && (
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4 min-w-0">
          <div className="text-xs font-semibold text-white/55 mb-2">
            {t("results.mediaKit.pastCollaborations.title")}
          </div>
          <div className="flex flex-wrap gap-2 min-w-0">
            {brands.map((brand) => (
              <span
                key={brand}
                className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/75 truncate max-w-full"
              >
                {brand}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Primary Niche & Audience Summary */}
      <div className="grid grid-cols-1 gap-3 min-w-0">
        {primaryNiche && (
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4 min-w-0">
            <div className="text-xs font-semibold text-white/55 mb-1">
              {t("results.mediaKit.about.lines.primaryNiche")}
            </div>
            <div className="text-sm text-white/85 break-words">
              {primaryNiche}
            </div>
          </div>
        )}

        {audienceSummary && (
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4 min-w-0">
            <div className="text-xs font-semibold text-white/55 mb-1">
              {t("results.mediaKit.about.lines.audienceSummary")}
            </div>
            <div className="text-sm text-white/85 break-words">
              {audienceSummary}
            </div>
          </div>
        )}
      </div>

      {/* Collaboration Categories */}
      {collaborationNiches && (
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4 min-w-0">
          <div className="text-xs font-semibold text-white/55 mb-2">
            {t("results.mediaKit.collaborationNiches.label")}
          </div>
          <div className="text-sm text-white/85 break-words">
            {collaborationNiches}
          </div>
        </div>
      )}

      {/* Collaboration Formats */}
      {formats.length > 0 && (
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4 min-w-0">
          <div className="text-xs font-semibold text-white/55 mb-2">
            {t("results.mediaKit.collaborationFormats.title")}
          </div>
          <div className="flex flex-wrap gap-2 min-w-0">
            {formats.map((format) => (
              <span
                key={format.id}
                className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/75"
              >
                {format.label}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Contact */}
      {hasContact && (
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4 min-w-0">
          <div className="text-xs font-semibold text-white/55 mb-2">
            {t("results.mediaKit.contact.title")}
          </div>
          <div className="flex flex-col gap-2 min-w-0">
            {contact?.email && (
              <div className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/75 truncate">
                {contact.email}
              </div>
            )}
            {contact?.other && (
              <div className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/75 truncate">
                {contact.other}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
