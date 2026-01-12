$ErrorActionPreference = "Stop"

function Write-Step($msg) {
  Write-Host "[push-migrations] $msg"
}

function Load-DotEnv($path) {
  if (!(Test-Path $path)) {
    throw "Env file not found: $path"
  }
  Get-Content $path | ForEach-Object {
    $line = $_.Trim()
    if ($line.Length -eq 0) { return }
    if ($line.StartsWith("#")) { return }
    $idx = $line.IndexOf("=")
    if ($idx -lt 0) { return }
    $key = $line.Substring(0, $idx).Trim()
    $val = $line.Substring($idx + 1).Trim()
    if ((($val.StartsWith('"') -and $val.EndsWith('"')) -or ($val.StartsWith("'") -and $val.EndsWith("'"))) -and $val.Length -ge 2) {
      $val = $val.Substring(1, $val.Length - 2)
    }
    [System.Environment]::SetEnvironmentVariable($key, $val, "Process")
  }
}

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path | Split-Path -Parent
Set-Location $repoRoot

$envFile = Join-Path $repoRoot ".env.production.local"

Write-Step "Pulling Vercel production env vars into .env.production.local"
& vercel env pull .env.production.local --environment=production

Write-Step "Loading .env.production.local into process env"
Load-DotEnv $envFile

$sbUrl = [System.Environment]::GetEnvironmentVariable("NEXT_PUBLIC_SUPABASE_URL", "Process")
if ([string]::IsNullOrWhiteSpace($sbUrl)) {
  throw "Missing NEXT_PUBLIC_SUPABASE_URL in .env.production.local (pulled from Vercel)"
}

Write-Step "Deriving Supabase project ref from NEXT_PUBLIC_SUPABASE_URL"
$ref = & node .\scripts\derive-supabase-ref.mjs .env.production.local
$ref = $ref.Trim()
if ([string]::IsNullOrWhiteSpace($ref)) {
  throw "Failed to derive SUPABASE project ref"
}

Write-Step "Supabase project ref: $ref"

# Required by Supabase CLI for db push
$dbPassword = [System.Environment]::GetEnvironmentVariable("SUPABASE_DB_PASSWORD", "Process")
if ([string]::IsNullOrWhiteSpace($dbPassword)) {
  Write-Host ""
  Write-Host "ERROR: Missing SUPABASE_DB_PASSWORD in Vercel production env vars." -ForegroundColor Red
  Write-Host "Please add SUPABASE_DB_PASSWORD as a Vercel Production Environment Variable, then re-run this script." -ForegroundColor Red
  Write-Host "(No Supabase UI required; this is a Vercel env var used only for automated migration push.)" -ForegroundColor Yellow
  exit 1
}

Write-Step "Linking Supabase CLI to production project"
& supabase link --project-ref $ref

Write-Step "Pushing migrations to production via supabase db push"
& supabase db push

Write-Step "NOTE: Skipping table verification (db execute not supported by current Supabase CLI)"
Write-Step "NOTE: If daily-snapshot/cron logs report missing_table_ig_daily_insights, run this script with a newer Supabase CLI."
