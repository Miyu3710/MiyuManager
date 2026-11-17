param(
  [switch]$SkipRust
)

$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Set-Location $Root

function Invoke-Step {
  param(
    [string]$Label,
    [string]$Command,
    [string[]]$Arguments,
    [string]$WorkingDirectory = $Root
  )

  Write-Host "\n== $Label ==" -ForegroundColor Cyan
  Push-Location $WorkingDirectory
  try {
    & $Command @Arguments
    if ($LASTEXITCODE -ne 0) {
      throw "$Label failed with exit code $LASTEXITCODE"
    }
  } finally {
    Pop-Location
  }
}

Invoke-Step -Label "Frontend lint" -Command "pnpm" -Arguments @("lint")
Invoke-Step -Label "Frontend typecheck" -Command "pnpm" -Arguments @("typecheck")
Invoke-Step -Label "Frontend tests" -Command "pnpm" -Arguments @("test")
Invoke-Step -Label "Frontend production build" -Command "pnpm" -Arguments @("build")

if (-not $SkipRust) {
  $TauriRoot = Join-Path $Root "src-tauri"
  Invoke-Step -Label "Rust format" -Command "cargo" -Arguments @("fmt", "--check") -WorkingDirectory $TauriRoot
  Invoke-Step -Label "Rust clippy" -Command "cargo" -Arguments @("clippy", "--", "-D", "warnings") -WorkingDirectory $TauriRoot
  Invoke-Step -Label "Rust tests" -Command "cargo" -Arguments @("test") -WorkingDirectory $TauriRoot
}

Write-Host "\nRelease checks passed." -ForegroundColor Green
