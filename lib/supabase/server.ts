import { createClient as createSupabaseClient } from "@supabase/supabase-js"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

function getUrl() {
  return (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim()
}

function getAnonKey() {
  return (
    process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    ""
  ).trim()
}

function getServiceRoleKey() {
  return (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim()
}

const _url = getUrl()
const _anonKey = getAnonKey()
const _serviceRoleKey = getServiceRoleKey()

/**
 * Legacy singleton Supabase server client.
 * @deprecated Use explicit client creators instead:
 * - createPublicClient() for public reads
 * - createServiceClient() for admin operations
 * - createAuthedClient() for user-session operations
 *
 * This export uses service role key if available, otherwise anon key.
 * Kept for backward compatibility with existing routes.
 */
export const supabaseServer = (_url && _anonKey)
  ? (_serviceRoleKey
      ? createSupabaseClient(_url, _serviceRoleKey, { auth: { persistSession: false } })
      : createSupabaseClient(_url, _anonKey, { auth: { persistSession: false } }))
  : (null as unknown as ReturnType<typeof createSupabaseClient>)

/**
 * Public, no-session Supabase client using anon key.
 * Safe for public read operations that don't require authentication.
 * Use this for endpoints/queries that work with public RLS policies.
 * 
 * Example use cases:
 * - Public creator profiles
 * - Public blog posts
 * - Any data with RLS policy: to anon, authenticated using (true)
 */
export function createPublicClient() {
  return createSupabaseClient(getUrl(), getAnonKey(), {
    auth: { persistSession: false },
  })
}

/**
 * Service role Supabase client (bypasses RLS).
 * ONLY use for server-side operations that require admin privileges.
 * NEVER expose this client or its results directly to the client.
 * 
 * Example use cases:
 * - Cron jobs that update all users
 * - Admin mutations (create/update/delete bypassing RLS)
 * - Server-only aggregations across all rows
 * 
 * @throws Error if SUPABASE_SERVICE_ROLE_KEY is not set
 */
export function createServiceClient() {
  const serviceRoleKey = getServiceRoleKey()
  if (!serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is required for service client. " +
      "This client bypasses RLS and should only be used in secure server contexts."
    )
  }
  return createSupabaseClient(getUrl(), serviceRoleKey, {
    auth: { persistSession: false },
  })
}

/**
 * Backward-compatible client creator.
 * 
 * @deprecated Prefer explicit client creators in new code:
 * - Use createPublicClient() for public RLS reads
 * - Use createAuthedClient() for user-session RLS personalization
 * - Use createServiceClient() for admin/server-only operations
 * 
 * This function exists for backward compatibility with existing code.
 * It returns service client if available, otherwise falls back to public client.
 */
export function createClient() {
  // Prefer service role if available (backward compat for existing server routes)
  if (getServiceRoleKey()) {
    return createServiceClient()
  }
  // Fallback to public client
  return createPublicClient()
}

/**
 * Authenticated, per-request Supabase client.
 * Uses Next.js cookies() to read/write auth session cookies.
 * Use this for endpoints/queries that require user authentication or RLS personalization.
 * 
 * Note: This function is async because Next.js 15+ cookies() returns a Promise.
 * 
 * Example use cases:
 * - User-specific data queries (e.g., "my favorites", "my profile")
 * - Mutations that require auth (e.g., update profile, create post)
 * - Any query with RLS policies that check auth.uid()
 */
export async function createAuthedClient() {
  const cookieStore = await cookies()
  
  return createServerClient(getUrl(), getAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options)
          })
        } catch {
          // In server components, cookie mutation may not be allowed
          // This is safe to ignore for read-only operations
        }
      },
    },
  })
}
