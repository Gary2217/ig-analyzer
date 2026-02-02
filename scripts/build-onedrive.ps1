$ErrorActionPreference = 'Stop'

# Kill running node/next processes (best-effort)
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Get-Process next -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

$nextDir = Join-Path (Get-Location) '.next'

if (Test-Path $nextDir) {
  for ($i = 0; $i -lt 3; $i++) {
    try {
      Remove-Item -LiteralPath $nextDir -Recurse -Force -ErrorAction Stop
      break
    } catch {
      Start-Sleep -Milliseconds 800
    }
  }

  if (Test-Path $nextDir) {
    $emptyDir = Join-Path $env:TEMP ('empty_next_' + [Guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $emptyDir | Out-Null

    # robocopy exit codes: 0-7 are success
    robocopy $emptyDir $nextDir /MIR /NFL /NDL /NJH /NJS | Out-Null
    if ($LASTEXITCODE -lt 8) { $global:LASTEXITCODE = 0 }

    Remove-Item -LiteralPath $emptyDir -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $nextDir -Recurse -Force -ErrorAction Stop
  }
}

# Run build using local next binary and propagate exit code
node .\node_modules\next\dist\bin\next build
exit $LASTEXITCODE
