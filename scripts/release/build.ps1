param(
  [switch]$SkipChecks,
  [switch]$ExecutableOnly,
  [switch]$SkipBuild
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

if ($SkipBuild) {
  Write-Host "\n== Reuse existing Tauri build ==" -ForegroundColor Cyan
} elseif ($ExecutableOnly) {
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
  $versionPattern = [regex]::Escape($Version)
  Get-ChildItem -LiteralPath $BundleRoot -Recurse -File |
    Where-Object {
      $_.Name -match "^MiyuManager_${versionPattern}_x64[-_]" -and
      ($_.Extension -in @(".msi", ".exe", ".sig"))
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
  codeSigning = "unsigned"
  updateSigning = if ($ExecutableOnly) { "not-applicable" } else { "tauri-updater" }
  updatePolicy = if ($ExecutableOnly) { "manual" } else { "tauri-updater" }
  artifacts = $ManifestArtifacts
}
$Manifest | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $OutDir "release-manifest.json") -Encoding utf8
$ManifestArtifacts | ForEach-Object { "$($_.sha256)  $($_.name)" } |
  Set-Content -LiteralPath (Join-Path $OutDir "SHA256SUMS.txt") -Encoding ascii

if (-not $ExecutableOnly) {
  $nsisName = "MiyuManager_${Version}_x64-setup.exe"
  $signaturePath = Join-Path $OutDir ($nsisName + ".sig")
  if (-not (Test-Path -LiteralPath $signaturePath)) {
    throw "Updater signature missing: $signaturePath. Set TAURI_SIGNING_PRIVATE_KEY before building."
  }
  $notesPath = Join-Path $Root "docs\RELEASE_NOTES.md"
  $notes = if (Test-Path -LiteralPath $notesPath) {
    [System.IO.File]::ReadAllText($notesPath, [System.Text.Encoding]::UTF8)
  } else {
    "MiyuManager v$Version"
  }
  $latest = [ordered]@{
    version = $Version
    notes = $notes
    pub_date = (Get-Date).ToUniversalTime().ToString("o")
    platforms = [ordered]@{
      "windows-x86_64" = [ordered]@{
        signature = (Get-Content -Raw -LiteralPath $signaturePath).Trim()
        url = "https://github.com/Miyu3710/MiyuManager/releases/download/v$Version/$nsisName"
      }
    }
  }
  $latest | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $OutDir "latest.json") -Encoding utf8
}

Write-Host "\nArtifacts copied to $OutDir" -ForegroundColor Green
