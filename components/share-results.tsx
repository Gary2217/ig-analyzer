'use client'

import { useState } from 'react'
import { Button } from "./ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card"
import { Copy, Check, Share2, Instagram } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '../lib/utils'

interface ShareResultsProps {
  platform: string
  username: string
  monetizationGap: number
}

type ShareVariant = 'creator' | 'professional' | 'curious'

export function ShareResults({ platform, username, monetizationGap }: ShareResultsProps) {
  const [isCopied, setIsCopied] = useState(false)
  const [shareVariant, setShareVariant] = useState<ShareVariant>('creator')
  const shareUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/results?share=true&platform=${platform}&username=${encodeURIComponent(username)}&monetizationGap=${monetizationGap}`

  const shareTemplates = {
    creator: `我剛分析了我的 ${platform === 'instagram' ? 'Instagram' : 'Threads'},\n距離穩定變現只差 ${monetizationGap}% 👀\n原來問題不是內容，而是方向。\n查看我的成長分析 →\n${shareUrl}`,
    professional: `我用工具分析了我的 ${platform === 'instagram' ? 'Instagram' : 'Threads'} 帳號，\n目前帳號成熟度已達可合作階段，\n距離穩定商業化只差最後 ${monetizationGap}%。\n查看完整分析 →\n${shareUrl}`,
    curious: `原來 ${platform === 'instagram' ? 'IG' : 'Threads'} 帳號卡住不是因為流量低。\n我分析後發現，我只差 ${monetizationGap}% 就能變現。\n你也可以測測看 →\n${shareUrl}`
  }

  const handleCopyLink = async () => {
    const fullShareText = shareTemplates[shareVariant]
    
    try {
      await navigator.clipboard.writeText(fullShareText)
      setIsCopied(true)
      toast.success('已複製分享內容')
      setTimeout(() => setIsCopied(false), 2000)
    } catch {
      toast.error('複製失敗，請重試')
    }
  }

  const handleShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({
          title: `${platform === 'instagram' ? 'Instagram' : 'Threads'} 分析結果`,
          text: shareTemplates[shareVariant].split('\n').slice(0, -1).join('\n'),
          url: shareUrl,
        })
      } else {
        await navigator.clipboard.writeText(shareUrl)
        toast.success('已複製連結')
      }
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        console.error('分享失敗:', err)
      }
    }
  }

  return (
    <Card className="border border-slate-700 bg-slate-800/50 hover:border-slate-600 transition-colors">
      <CardHeader className="pb-4 px-4 md:px-6">
        <CardTitle className="text-lg flex items-center gap-3 text-slate-100">
          <Share2 className="h-5 w-5 text-blue-400 shrink-0" />
          <span className="leading-relaxed">把這次分析，直接變成可發布內容</span>
        </CardTitle>
        <p className="text-sm text-slate-400 mt-1 leading-relaxed">
          選一個風格，一鍵生成可直接貼到 Threads / 社群的文案。
        </p>
      </CardHeader>
      <CardContent className="p-4 md:p-6 space-y-4">
        <div className="bg-slate-800/50 p-4 md:p-6 rounded-lg border border-slate-700">
          <p className="text-sm text-slate-400 mb-3 font-medium">
            選擇你要的語氣：
          </p>
          
          <div className="grid grid-cols-3 gap-2 mb-4">
            <button
              type="button"
              onClick={() => setShareVariant('creator')}
              className={cn(
                'text-xs py-2 px-3 rounded-md transition-colors',
                shareVariant === 'creator' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-slate-700 hover:bg-slate-600 text-slate-200'
              )}
            >
              創作者版
            </button>
            <button
              type="button"
              onClick={() => setShareVariant('professional')}
              className={cn(
                'text-xs py-2 px-3 rounded-md transition-colors',
                shareVariant === 'professional' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-slate-700 hover:bg-slate-600 text-slate-200'
              )}
            >
              接案/專業版
            </button>
            <button
              type="button"
              onClick={() => setShareVariant('curious')}
              className={cn(
                'text-xs py-2 px-3 rounded-md transition-colors',
                shareVariant === 'curious' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-slate-700 hover:bg-slate-600 text-slate-200'
              )}
            >
              引戰/好奇版
            </button>
          </div>

          <p className="text-xs text-slate-500 mb-4 leading-relaxed">
            {shareVariant === 'creator' && '適合：創作者日常更新、分享近況與成果。'}
            {shareVariant === 'professional' && '適合：對接品牌／接案合作，用更專業的語氣呈現。'}
            {shareVariant === 'curious' && '適合：引發互動與討論（好奇／引戰／反差感）。'}
          </p>
          
          <div className="bg-slate-900/30 border border-slate-700 rounded-lg p-4 md:p-6 text-sm mb-4">
            <p className="whitespace-pre-wrap text-slate-200 leading-relaxed">
              {shareVariant === 'creator' && (
                `我剛分析了我的 ${platform === 'instagram' ? 'Instagram' : 'Threads'},\n距離穩定變現只差 ${monetizationGap}% 👀\n原來問題不是內容，而是方向。`
              )}
              {shareVariant === 'professional' && (
                `我用工具分析了我的 ${platform === 'instagram' ? 'Instagram' : 'Threads'} 帳號，\n目前帳號成熟度已達可合作階段，\n距離穩定商業化只差最後 ${monetizationGap}%。`
              )}
              {shareVariant === 'curious' && (
                `原來 ${platform === 'instagram' ? 'IG' : 'Threads'} 帳號卡住不是因為流量低。\n我分析後發現，我只差 ${monetizationGap}% 就能變現。\n你也可以測測看 →`
              )}
            </p>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-3">
            <Button 
              variant="outline"
              className="flex-1 bg-slate-800 border-slate-700 hover:bg-slate-700 hover:border-slate-600 text-slate-200"
              onClick={handleCopyLink}
            >
              <span className="inline-flex items-center gap-3 px-1">
                {isCopied ? (
                  <Check className="h-4 w-4 text-green-400 shrink-0" />
                ) : (
                  <Copy className="h-4 w-4 text-blue-400 shrink-0" />
                )}
                <span className="font-medium leading-relaxed">{isCopied ? '已複製' : '複製文案'}</span>
              </span>
            </Button>
            <Button 
              className="flex-1 gap-2 bg-blue-600 hover:bg-blue-700 text-white"
              onClick={handleShare}
            >
              <Share2 className="h-4 w-4 shrink-0" />
              <span className="font-medium leading-relaxed">立刻分享</span>
            </Button>
          </div>
        </div>
        
        <div className="flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-800">
          <span className="flex items-center gap-2 text-slate-400 px-1">
            <Instagram className="h-3 w-3 text-blue-400 shrink-0" />
            <span className="leading-relaxed">@{username}</span>
          </span>
          <span className="text-slate-500">Powered by IG Analyzer</span>
        </div>
      </CardContent>
    </Card>
  )
}
