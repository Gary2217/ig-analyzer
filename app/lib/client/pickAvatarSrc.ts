export function pickAvatarSrc(input: { avatarUrl?: unknown; profileImageUrl?: unknown }): string | null {
  const a = typeof input?.avatarUrl === "string" ? input.avatarUrl.trim() : ""
  if (a) return a

  return null
}
