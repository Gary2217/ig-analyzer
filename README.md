## 2026-01-01 Progress

- Fixed Results i18n raw key issue
- Forced full reload on locale switch
- Updated .env.local:
  - APP_BASE_URL -> trycloudflare URL
  - IG_PREFERRED_USERNAME set
- Direction rethink: shift toward creator / brand collaboration evaluation

## One-time production migration push (no manual SQL)

### Prereqs (Windows)

```powershell
npm i -g vercel supabase
vercel login
supabase login
vercel link
```

### Required env vars (pulled from Vercel)

- `NEXT_PUBLIC_SUPABASE_URL` (pulled by `vercel env pull`)
- `SUPABASE_DB_PASSWORD` (must exist in Vercel Production env vars; used by Supabase CLI to run `supabase db push`)

### Run

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\push-migrations.ps1
```

<!-- cron redeploy trigger -->
