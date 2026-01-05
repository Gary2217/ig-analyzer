# Production Readiness Checklist (MVP Demo)

This checklist is intended for a **safe public demo** deploy.

Constraints/notes:
- Do **not** change i18n message keys/strings.
- Do **not** log or return access tokens.
- OAuth redirect URLs must match the deployed public URL.

## 1) Environment Variables (external OAuth correctness)

### Required
- `APP_BASE_URL`
  - Must be your **public** URL during demo (e.g. `https://<random>.trycloudflare.com`).
- `META_APP_ID`
  - Non-empty.
- `META_APP_SECRET`
  - Non-empty.

### Optional / related
- `NEXT_PUBLIC_APP_BASE_URL`
  - If set, keep it aligned with `APP_BASE_URL`.

### Dev-only runtime warning
- When browsing via a `trycloudflare.com` host, the Results page will emit a **dev-only** `console.debug` warning if `NEXT_PUBLIC_APP_BASE_URL` still points to `localhost`.

## 2) Token / Secret Hygiene

### Required properties
- No access tokens are returned in JSON payloads.
- No access tokens are logged (server or client).

### What to verify in this repo
- `/api/instagram/media`
  - Sanitizes `paging.next` by removing `access_token` before returning.
  - Redacts `access_token` when building short error details.
- Search for token leaks:
  - Search for `access_token` and confirm:
    - No console logs print full Graph URLs containing `access_token=...`.
    - No API route returns any field containing raw access tokens.

### Optional debug flags (keep OFF for demo)
- `IG_OAUTH_DEBUG`
  - If set to `1`, callback route emits extra debug logs (it does not print the token, but still increases log noise).
  - For demo: leave unset or set to `0`.

## 3) Results Page Stability (must not regress)

### Expected behavior
- Media-first rendering:
  - KPIs + Top Posts should populate from fetched media when available.
- `/me` is non-blocking:
  - If `/api/auth/instagram/me` is canceled/empty/204/3xx, it must be treated as **pending**.
  - It must **not** flip the UI into a blocking “cannot analyze / needs setup” state.
- Retry behavior:
  - Retry must reset **both** guards and re-trigger:
    - `/api/instagram/media`
    - `/api/auth/instagram/me`
- Syncing/updating:
  - If effective media exists, the page must not remain “syncing/updating” just because `/me` is pending.

## 4) Mobile / Responsive Safety Pass (no redesign)

### Quick audit targets
- KPI row:
  - Numbers remain readable, no overflow.
- Top Posts cards:
  - Titles/captions don’t overflow their card.
  - Buttons remain tappable.

### Allowed fixes
- Only apply minimal overflow guards if a real regression is observed:
  - `min-w-0`, `truncate`, `whitespace-nowrap`, `tabular-nums`, `line-clamp-*`.

## 5) Deploy / Demo Verification Steps

### Local
1. Start dev server:
   - `npm run dev`
2. Open:
   - `http://localhost:3000/zh-TW/results`
3. Run OAuth flow.
4. DevTools Network:
   - Confirm `GET /api/auth/instagram/me` eventually returns `200` with JSON (it may be canceled sometimes).
   - Confirm `GET /api/instagram/media` returns `200`.
5. UI checks:
   - KPI cards show values when media exists.
   - Top Posts show real posts when media exists.
   - No infinite syncing.

### External (trycloudflare)
1. Start tunnel:
   - `cloudflared tunnel --url http://localhost:3000`
2. Set env:
   - `APP_BASE_URL=https://<random>.trycloudflare.com`
   - (Optional) `NEXT_PUBLIC_APP_BASE_URL=https://<random>.trycloudflare.com`
3. In Meta app settings:
   - Add **Valid OAuth Redirect URI**:
     - `https://<random>.trycloudflare.com/api/auth/instagram/callback`
4. Restart dev server after env changes.
5. Run OAuth flow end-to-end.
6. DevTools Network:
   - You may still see `me` request as `(canceled)` occasionally.
   - If `media` is `200` and effective media exists, Results UI must still render KPIs + Top Posts.

---

## Quick command-line checks (optional)
- Find token-related strings:
  - Search repository for `access_token` and review any logs/returned payloads.
