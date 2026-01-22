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
    title: messages.results?.meta?.title || "Account Analysis Results | Social Analytics",
    description: messages.results?.meta?.description || "View in-depth analysis of Instagram account authenticity, engagement rate, automation risk, and more",
    openGraph: {
      title: messages.results?.meta?.title || "Account Analysis Results | Social Analytics",
      description: messages.results?.meta?.description || "View in-depth analysis of Instagram account authenticity, engagement rate, automation risk, and more",
      locale: locale,
    },
    twitter: {
      card: "summary_large_image",
      title: messages.results?.meta?.title || "Account Analysis Results | Social Analytics",
      description: messages.results?.meta?.description || "View in-depth analysis of Instagram account authenticity, engagement rate, automation risk, and more",
    },
  }
}

export default function ResultsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
