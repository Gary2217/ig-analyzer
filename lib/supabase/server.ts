import { createClient } from "@supabase/supabase-js"

const url = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim()
const key = (
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  ""
).trim()

if (!url || !key) {
  throw new Error(
    "Missing Supabase env: SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY / NEXT_PUBLIC_SUPABASE_ANON_KEY",
  )
}

export const supabaseServer = createClient(url, key, {
  auth: { persistSession: false },
})
