export async function getActiveIgUserId(
  authedSupabase: any,
  userId: string,
): Promise<string | null> {
  if (!authedSupabase || !userId) return null

  try {
    const { data, error } = await authedSupabase
      .from("user_instagram_accounts")
      .select("ig_user_id")
      .eq("user_id", userId)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle()

    if (error) return null

    const igUserId =
      data && typeof (data as any).ig_user_id === "string"
        ? String((data as any).ig_user_id).trim()
        : ""

    return igUserId ? igUserId : null
  } catch {
    return null
  }
}
