export function pickAvatarSrc(input: { avatarUrl?: unknown; profileImageUrl?: unknown }): string | null {
  const a = typeof input?.avatarUrl === "string" ? input.avatarUrl.trim() : ""
  if (a) return a

  const p = typeof input?.profileImageUrl === "string" ? input.profileImageUrl.trim() : ""
  if (p) return p

  return null
}
