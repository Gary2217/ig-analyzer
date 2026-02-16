import type { SupabaseClient } from "@supabase/supabase-js"

export type UserIgAccountRow = {
  id: string
  user_id: string
  provider: string
  ig_user_id: string | null
  page_id: string | null
  access_token: string | null
  expires_at: string | null
  created_at: string
  connected_at: string
  updated_at: string
  revoked_at: string | null
}

export async function getUserIgAccountForAuthedUser(
  supabase: SupabaseClient,
  opts?: { provider?: string }
): Promise<{ row: UserIgAccountRow | null; error: string | null }> {
  const provider = opts?.provider ?? "instagram"

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError) {
    return { row: null, error: authError.message }
  }
  if (!user) {
    return { row: null, error: "not_authenticated" }
  }

  const { data, error } = await supabase
    .from("user_ig_accounts")
    .select(
      "id,user_id,provider,ig_user_id,page_id,access_token,expires_at,created_at,connected_at,updated_at,revoked_at"
    )
    .eq("user_id", user.id)
    .eq("provider", provider)
    .maybeSingle()

  if (error) {
    return { row: null, error: error.message }
  }

  return { row: (data as any) ?? null, error: null }
}
