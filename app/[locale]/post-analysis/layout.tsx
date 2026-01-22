import { loadMessages, type Locale } from "../../lib/i18n"
import type { Metadata } from "next"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const resolvedParams = await params
  const locale: Locale = resolvedParams.locale === "zh-TW" ? "zh-TW" : "en"
  const messages = await loadMessages(locale)

  return {
    title: messages.postAnalysis?.meta?.title || "Post Analysis | Social Analytics",
    description: messages.postAnalysis?.meta?.description || "Deep analysis of individual Instagram post performance, engagement rate, and audience response",
    openGraph: {
      title: messages.postAnalysis?.meta?.title || "Post Analysis | Social Analytics",
      description: messages.postAnalysis?.meta?.description || "Deep analysis of individual Instagram post performance, engagement rate, and audience response",
      locale: locale,
    },
    twitter: {
      card: "summary_large_image",
      title: messages.postAnalysis?.meta?.title || "Post Analysis | Social Analytics",
      description: messages.postAnalysis?.meta?.description || "Deep analysis of individual Instagram post performance, engagement rate, and audience response",
    },
  }
}

export default function PostAnalysisLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
