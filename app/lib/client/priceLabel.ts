export function formatPriceLabel(opts: {
  minPrice: number | null | undefined
  locale: "zh-TW" | "en" | string
}): string {
  const locale = /^zh(-|$)/i.test(String(opts.locale || "")) ? "zh-TW" : "en"
  const mp = typeof opts.minPrice === "number" && Number.isFinite(opts.minPrice) ? Math.max(0, Math.floor(opts.minPrice)) : null

  if (mp == null) {
    return locale === "zh-TW" ? "洽談報價" : "Contact for quote"
  }

  const amount = mp.toLocaleString()
  return locale === "zh-TW" ? `接案金額 NT$${amount} 起` : `Starting from NT$${amount}`
}
