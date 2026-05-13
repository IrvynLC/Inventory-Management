param(
  [string]$OutputDirectory = (Join-Path $PSScriptRoot "..\dist"),
  [string]$PackageName = "inventory-management-synology"
)

$ErrorActionPreference = "Stop"

$root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$stagingRoot = Join-Path $OutputDirectory "$PackageName-$timestamp"
$zipPath = Join-Path $OutputDirectory "$PackageName-$timestamp.zip"

if (Test-Path -LiteralPath $stagingRoot) {
  Remove-Item -LiteralPath $stagingRoot -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $stagingRoot | Out-Null
New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null

$items = @(
  "config",
  "Dockerfile",
  "package-lock.json",
  "package.json",
  "public",
  "README.md",
  "README-SYNOLOGY.md",
  "scripts",
  "server"
)

foreach ($item in $items) {
  $source = Join-Path $root $item
  if (-not (Test-Path -LiteralPath $source)) { continue }
  $destination = Join-Path $stagingRoot $item
  if ((Get-Item -LiteralPath $source).PSIsContainer) {
    Copy-Item -LiteralPath $source -Destination $destination -Recurse
  } else {
    Copy-Item -LiteralPath $source -Destination $destination
  }
}

Copy-Item -LiteralPath (Join-Path $root "docker-compose.synology.yml") -Destination (Join-Path $stagingRoot "docker-compose.yml")
Copy-Item -LiteralPath (Join-Path $root ".env.synology.example") -Destination (Join-Path $stagingRoot ".env.example")
Copy-Item -LiteralPath (Join-Path $root ".env.synology.example") -Destination (Join-Path $stagingRoot ".env")
Copy-Item -LiteralPath (Join-Path $root ".dockerignore") -Destination (Join-Path $stagingRoot ".dockerignore")

$productionUsersPath = Join-Path $stagingRoot "config\users.production.json"
if (-not (Test-Path -LiteralPath $productionUsersPath)) {
  Copy-Item -LiteralPath (Join-Path $stagingRoot "config\users.example.json") -Destination $productionUsersPath
}

Get-ChildItem -Path $stagingRoot -Recurse -Include "users.production.json" |
  Where-Object { $_.FullName -notlike "*$([IO.Path]::DirectorySeparatorChar)config$([IO.Path]::DirectorySeparatorChar)users.production.json" } |
  Remove-Item -Force

if (Test-Path -LiteralPath $zipPath) {
  Remove-Item -LiteralPath $zipPath -Force
}
Compress-Archive -Path (Join-Path $stagingRoot "*") -DestinationPath $zipPath -Force

Write-Host "Synology package created:"
Write-Host $zipPath
Write-Host ""
Write-Host "Before go-live, edit these files inside the extracted package on Synology:"
Write-Host "- .env"
Write-Host "- config/users.production.json"
