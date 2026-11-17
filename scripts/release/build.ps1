param(
  [switch]$SkipChecks,
  [switch]$ExecutableOnly
)

$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Set-Location $Root

function Get-Sha256 {
  param([string]$Path)

  $stream = [System.IO.File]::OpenRead($Path)
  try {
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try {
      $hash = $sha.ComputeHash($stream)
      return (($hash | ForEach-Object { $_.ToString("x2") }) -join "")
    } finally {
      $sha.Dispose()
    }
  } finally {
    $stream.Dispose()
  }
}

if (-not $SkipChecks) {
  & (Join-Path $PSScriptRoot "check.ps1")
  if ($LASTEXITCODE -ne 0) {
    throw "Release checks failed"
  }
}

if ($ExecutableOnly) {
  Write-Host "\n== Tauri release executable ==" -ForegroundColor Cyan
  pnpm tauri build --no-bundle
  if ($LASTEXITCODE -ne 0) {
    throw "Tauri release executable build failed"
  }
} else {
  Write-Host "\n== Tauri bundles ==" -ForegroundColor Cyan
  pnpm tauri build
  if ($LASTEXITCODE -ne 0) {
    throw "Tauri bundle build failed"
  }
}

$Config = Get-Content -Raw -LiteralPath (Join-Path $Root "src-tauri\tauri.conf.json") | ConvertFrom-Json
$Version = [string]$Config.version
$OutDir = Join-Path $Root "outputs\release\$Version"
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
Get-ChildItem -LiteralPath $OutDir -File -ErrorAction SilentlyContinue | Remove-Item -Force

$BundleRoot = Join-Path $Root "src-tauri\target\release\bundle"
$Artifacts = if ($ExecutableOnly) {
  @(Get-Item -LiteralPath (Join-Path $Root "src-tauri\target\release\miyumanager.exe"))
} else {
  Get-ChildItem -LiteralPath $BundleRoot -Recurse -File |
    Where-Object {
      $_.Extension -in @(".msi", ".exe") -and
      $_.Name -match "(setup|MiyuManager.*\.msi|MiyuManager.*\.exe)$"
    }
}

if ($Artifacts.Count -eq 0) {
  throw "No MSI or NSIS artifacts found under $BundleRoot"
}

$ManifestArtifacts = @()
foreach ($Artifact in $Artifacts) {
  Copy-Item -LiteralPath $Artifact.FullName -Destination (Join-Path $OutDir $Artifact.Name) -Force
  $Hash = Get-Sha256 -Path $Artifact.FullName
  $ManifestArtifacts += [ordered]@{
    name = $Artifact.Name
    sha256 = $Hash
    sizeBytes = $Artifact.Length
    source = $Artifact.FullName
  }
}

$Manifest = [ordered]@{
  product = "MiyuManager"
  version = $Version
  packageMode = if ($ExecutableOnly) { "executable-only" } else { "installer" }
  generatedAt = (Get-Date).ToUniversalTime().ToString("o")
  signing = "unsigned"
  updatePolicy = "manual-check-only"
  artifacts = $ManifestArtifacts
}
$Manifest | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $OutDir "release-manifest.json") -Encoding utf8
$ManifestArtifacts | ForEach-Object { "$($_.sha256)  $($_.name)" } |
  Set-Content -LiteralPath (Join-Path $OutDir "SHA256SUMS.txt") -Encoding ascii

Write-Host "\nArtifacts copied to $OutDir" -ForegroundColor Green
