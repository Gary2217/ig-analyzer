import DemoToolPanel from "./components/demo-tool-panel"

export default async function LocaleHomePage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const resolved = await params
  const rawLocale = resolved?.locale
  const locale = rawLocale === "en" ? "en" : "zh-TW"

  return (
    <div className="min-h-[calc(100dvh-220px)] flex items-center justify-center">
      <div className="w-full max-w-5xl mx-auto">
        <DemoToolPanel activeLocale={locale} isConnectedFromServer={false} checking={false} />
      </div>
    </div>
  )
}
