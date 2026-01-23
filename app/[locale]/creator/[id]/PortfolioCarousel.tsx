"use client"

import { useRef, useState, useEffect } from "react"

interface PortfolioItem {
  displayTitle: string
  displaySubtitle: string
  thumbnailUrl: string
  clickUrl: string
  platformLabel: string
}

interface PortfolioCarouselProps {
  items: PortfolioItem[]
  locale: "zh-TW" | "en"
  getLocalizedTag: (tag: string) => string
}

export function PortfolioCarousel({ items, locale, getLocalizedTag }: PortfolioCarouselProps) {
  const railRef = useRef<HTMLDivElement | null>(null)
  const [canPrev, setCanPrev] = useState(false)
  const [canNext, setCanNext] = useState(false)

  const updateArrowState = () => {
    const el = railRef.current
    if (!el) return
    const maxScrollLeft = el.scrollWidth - el.clientWidth
    setCanPrev(el.scrollLeft > 2)
    setCanNext(el.scrollLeft < maxScrollLeft - 2)
  }

  const scrollByCards = (dir: "prev" | "next") => {
    const el = railRef.current
    if (!el) return
    const amount = Math.max(260, Math.floor(el.clientWidth * 0.85))
    el.scrollBy({ left: dir === "next" ? amount : -amount, behavior: "smooth" })
  }

  useEffect(() => {
    updateArrowState()
    
    const handleResize = () => updateArrowState()
    window.addEventListener("resize", handleResize)
    
    return () => window.removeEventListener("resize", handleResize)
  }, [items])

  if (items.length === 0) {
    return null
  }

  return (
    <div className="relative">
      {/* Left Arrow */}
      <button
        type="button"
        onClick={() => scrollByCards("prev")}
        disabled={!canPrev}
        aria-label={locale === "zh-TW" ? "上一個作品" : "Previous item"}
        className={`absolute left-2 top-1/2 -translate-y-1/2 z-10 h-10 w-10 rounded-full
          border border-white/15 bg-black/30 backdrop-blur
          flex items-center justify-center
          transition-opacity
          ${canPrev ? "opacity-100 hover:bg-black/50" : "opacity-0 pointer-events-none"}`}
      >
        <span className="text-white/80 text-lg leading-none">‹</span>
      </button>

      {/* Right Arrow */}
      <button
        type="button"
        onClick={() => scrollByCards("next")}
        disabled={!canNext}
        aria-label={locale === "zh-TW" ? "下一個作品" : "Next item"}
        className={`absolute right-2 top-1/2 -translate-y-1/2 z-10 h-10 w-10 rounded-full
          border border-white/15 bg-black/30 backdrop-blur
          flex items-center justify-center
          transition-opacity
          ${canNext ? "opacity-100 hover:bg-black/50" : "opacity-0 pointer-events-none"}`}
      >
        <span className="text-white/80 text-lg leading-none">›</span>
      </button>

      {/* Scroll Rail */}
      <div
        ref={railRef}
        onScroll={updateArrowState}
        className="overflow-x-auto scroll-smooth px-4 sm:px-5 pb-2
               [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
      >
        <div className="flex gap-5">
          {items.map((item, index: number) => {
            const CardContent = (
              <>
                {/* Thumbnail */}
                <div className="relative w-full aspect-[3/4] rounded-2xl overflow-hidden bg-white/10 border border-white/20 mb-3">
                  {item.thumbnailUrl ? (
                    <img
                      src={item.thumbnailUrl}
                      alt={item.displayTitle || "Portfolio item"}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-white/40 text-xs">
                      {item.platformLabel || "Work"}
                    </div>
                  )}
                </div>
                
                {/* Title */}
                {item.displayTitle && (
                  <div className="text-base sm:text-lg text-white/90 line-clamp-2 leading-tight mb-1">
                    {item.displayTitle}
                  </div>
                )}
                
                {/* Subtitle / Platform Badge */}
                {item.displaySubtitle && (
                  <div className="text-xs text-white/60 uppercase tracking-wide">
                    {getLocalizedTag(item.displaySubtitle)}
                  </div>
                )}
              </>
            )
            
            return item.clickUrl && item.clickUrl.trim() !== "" ? (
              <a
                key={index}
                href={item.clickUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-shrink-0 w-72 sm:w-80 rounded-xl bg-white/5 border border-white/10 p-5 hover:bg-white/10 hover:border-white/20 transition-colors snap-start"
              >
                {CardContent}
              </a>
            ) : (
              <div
                key={index}
                className="flex-shrink-0 w-72 sm:w-80 rounded-xl bg-white/5 border border-white/10 p-5 snap-start"
              >
                {CardContent}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
