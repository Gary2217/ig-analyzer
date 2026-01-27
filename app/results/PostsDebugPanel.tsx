"use client"

import { useState } from "react"
import { ChevronDown, ChevronUp } from "lucide-react"

interface PostDebugInfo {
  id: string
  media_type: string
  hasThumb: boolean
  hasMediaUrl: boolean
  thumbHost: string
  mediaHost: string
}

interface PostsDebugPanelProps {
  isConnected: boolean
  hasRealMedia: boolean
  mediaLength: number
  effectiveRecentMediaLength: number
  topPerformingPostsLength: number
  latestPostsLength: number
  topPostsSample: PostDebugInfo[]
  latestPostsSample: PostDebugInfo[]
}

export function PostsDebugPanel(props: PostsDebugPanelProps) {
  const [isOpen, setIsOpen] = useState(false)

  // Only show in development
  if (process.env.NODE_ENV === "production") {
    return null
  }

  return (
    <div className="my-4 rounded-lg border border-yellow-500/30 bg-yellow-500/5 overflow-hidden max-w-full">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-4 py-2 text-left text-sm font-medium text-yellow-400 hover:bg-yellow-500/10 transition-colors"
      >
        <span>🔍 DEV: Posts Debug Panel</span>
        {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>

      {isOpen && (
        <div className="px-4 py-3 space-y-3 text-xs text-white/80 overflow-x-auto">
          {/* Status flags */}
          <div className="space-y-1">
            <div className="font-semibold text-yellow-400">Status Flags:</div>
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div>isConnected: <span className={props.isConnected ? "text-green-400" : "text-red-400"}>{String(props.isConnected)}</span></div>
              <div>hasRealMedia: <span className={props.hasRealMedia ? "text-green-400" : "text-red-400"}>{String(props.hasRealMedia)}</span></div>
            </div>
          </div>

          {/* Data counts */}
          <div className="space-y-1">
            <div className="font-semibold text-yellow-400">Data Counts:</div>
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div>media.length: <span className="text-cyan-400">{props.mediaLength}</span></div>
              <div>effectiveRecentMedia: <span className="text-cyan-400">{props.effectiveRecentMediaLength}</span></div>
              <div>topPerformingPosts: <span className="text-cyan-400">{props.topPerformingPostsLength}</span></div>
              <div>latestPosts: <span className="text-cyan-400">{props.latestPostsLength}</span></div>
            </div>
          </div>

          {/* Top Posts Sample */}
          {props.topPostsSample.length > 0 && (
            <div className="space-y-1">
              <div className="font-semibold text-yellow-400">Top Posts Sample (first 3):</div>
              <div className="space-y-2">
                {props.topPostsSample.map((post, idx) => (
                  <div key={post.id} className="pl-2 border-l-2 border-yellow-500/30 space-y-0.5 text-[10px]">
                    <div>#{idx + 1} ID: <span className="text-purple-400">{post.id.slice(0, 12)}...</span></div>
                    <div>Type: <span className="text-blue-400">{post.media_type}</span></div>
                    <div className="flex gap-3">
                      <span>hasThumb: <span className={post.hasThumb ? "text-green-400" : "text-red-400"}>{String(post.hasThumb)}</span></span>
                      <span>hasMediaUrl: <span className={post.hasMediaUrl ? "text-green-400" : "text-red-400"}>{String(post.hasMediaUrl)}</span></span>
                    </div>
                    <div>thumbHost: <span className="text-orange-400">{post.thumbHost || "N/A"}</span></div>
                    <div>mediaHost: <span className="text-orange-400">{post.mediaHost || "N/A"}</span></div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Latest Posts Sample */}
          {props.latestPostsSample.length > 0 && (
            <div className="space-y-1">
              <div className="font-semibold text-yellow-400">Latest Posts Sample (first 3):</div>
              <div className="space-y-2">
                {props.latestPostsSample.map((post, idx) => (
                  <div key={post.id} className="pl-2 border-l-2 border-yellow-500/30 space-y-0.5 text-[10px]">
                    <div>#{idx + 1} ID: <span className="text-purple-400">{post.id.slice(0, 12)}...</span></div>
                    <div>Type: <span className="text-blue-400">{post.media_type}</span></div>
                    <div className="flex gap-3">
                      <span>hasThumb: <span className={post.hasThumb ? "text-green-400" : "text-red-400"}>{String(post.hasThumb)}</span></span>
                      <span>hasMediaUrl: <span className={post.hasMediaUrl ? "text-green-400" : "text-red-400"}>{String(post.hasMediaUrl)}</span></span>
                    </div>
                    <div>thumbHost: <span className="text-orange-400">{post.thumbHost || "N/A"}</span></div>
                    <div>mediaHost: <span className="text-orange-400">{post.mediaHost || "N/A"}</span></div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Empty state hint */}
          {props.mediaLength === 0 && props.effectiveRecentMediaLength === 0 && (
            <div className="p-2 rounded bg-red-500/10 border border-red-500/30 text-red-400 text-[11px]">
              ⚠️ No media data returned (check /api/instagram/media response in Network tab)
            </div>
          )}
        </div>
      )}
    </div>
  )
}
