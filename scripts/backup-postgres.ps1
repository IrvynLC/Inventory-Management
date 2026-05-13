param(
  [string]$Database = $env:PGDATABASE,
  [string]$HostName = $(if ($env:PGHOST) { $env:PGHOST } else { "127.0.0.1" }),
  [int]$Port = $(if ($env:PGPORT) { [int]$env:PGPORT } else { 5432 }),
  [string]$UserName = $env:PGUSER,
  [string]$BackupDirectory = $(Join-Path $PSScriptRoot "..\backups\postgres"),
  [int]$RetentionDays = 30,
  [string]$PgDumpPath = $env:PGDUMP_PATH
)

$ErrorActionPreference = "Stop"

function Resolve-PostgresTool {
  param(
    [string]$ConfiguredPath,
    [string]$ToolName
  )

  if ($ConfiguredPath -and (Test-Path -LiteralPath $ConfiguredPath)) {
    return (Resolve-Path -LiteralPath $ConfiguredPath).Path
  }

  $command = Get-Command $ToolName -ErrorAction SilentlyContinue
  if ($command) {
    return $command.Source
  }

  $programFilesPath = Join-Path $env:ProgramFiles "PostgreSQL"
  if (Test-Path -LiteralPath $programFilesPath) {
    $candidate = Get-ChildItem -Path $programFilesPath -Recurse -Filter $ToolName -ErrorAction SilentlyContinue |
      Sort-Object FullName -Descending |
      Select-Object -First 1
    if ($candidate) {
      return $candidate.FullName
    }
  }

  throw "Could not find $ToolName. Set PGDUMP_PATH or add PostgreSQL bin to PATH."
}

if (-not $Database) { throw "PGDATABASE or -Database is required." }
if (-not $UserName) { throw "PGUSER or -UserName is required." }
$pgpassFile = Join-Path $env:APPDATA "postgresql\pgpass.conf"
$hasReadablePgpass = $false
if (Test-Path -LiteralPath $pgpassFile) {
  try {
    Get-Content -LiteralPath $pgpassFile -TotalCount 1 -ErrorAction Stop | Out-Null
    $hasReadablePgpass = $true
    $env:PGPASSFILE = $pgpassFile
  } catch {
    $hasReadablePgpass = $false
  }
}
if (-not $env:PGPASSWORD -and -not $hasReadablePgpass) {
  throw "Set PGPASSWORD or configure %APPDATA%\postgresql\pgpass.conf before running a backup."
}

$pgDump = Resolve-PostgresTool -ConfiguredPath $PgDumpPath -ToolName "pg_dump.exe"
$backupRoot = Resolve-Path -LiteralPath (New-Item -ItemType Directory -Force -Path $BackupDirectory).FullName
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$safeDatabase = $Database -replace "[^A-Za-z0-9_.-]", "_"
$backupFile = Join-Path $backupRoot "inventory-$safeDatabase-$timestamp.dump"
$manifestFile = Join-Path $backupRoot "inventory-$safeDatabase-$timestamp.json"

& $pgDump `
  --host $HostName `
  --port $Port `
  --username $UserName `
  --format custom `
  --compress 9 `
  --no-owner `
  --no-acl `
  --file $backupFile `
  $Database

if ($LASTEXITCODE -ne 0) {
  throw "pg_dump failed with exit code $LASTEXITCODE."
}

$backupItem = Get-Item -LiteralPath $backupFile
$manifest = [ordered]@{
  database = $Database
  host = $HostName
  port = $Port
  user = $UserName
  createdAt = (Get-Date).ToString("o")
  file = $backupItem.FullName
  bytes = $backupItem.Length
  pgDump = $pgDump
  format = "pg_dump custom"
}
$manifest | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $manifestFile -Encoding UTF8

if ($RetentionDays -gt 0) {
  $cutoff = (Get-Date).AddDays(-$RetentionDays)
  Get-ChildItem -LiteralPath $backupRoot -File -Filter "inventory-$safeDatabase-*" |
    Where-Object { $_.LastWriteTime -lt $cutoff } |
    Remove-Item -Force
}

Write-Host "PostgreSQL backup created:"
Write-Host $backupFile
