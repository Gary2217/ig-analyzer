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
    title: messages.creatorCard?.meta?.title || "Creator Card | Social Analytics",
    description: messages.creatorCard?.meta?.description || "Create and share your professional creator card with portfolio, collaborations, and key metrics",
    openGraph: {
      title: messages.creatorCard?.meta?.title || "Creator Card | Social Analytics",
      description: messages.creatorCard?.meta?.description || "Create and share your professional creator card with portfolio, collaborations, and key metrics",
      locale: locale,
    },
    twitter: {
      card: "summary_large_image",
      title: messages.creatorCard?.meta?.title || "Creator Card | Social Analytics",
      description: messages.creatorCard?.meta?.description || "Create and share your professional creator card with portfolio, collaborations, and key metrics",
    },
  }
}

export default function CreatorCardLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
