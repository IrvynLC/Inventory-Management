param(
  [Parameter(Mandatory = $true)]
  [string]$BackupFile,
  [string]$Database = $env:PGDATABASE,
  [string]$HostName = $(if ($env:PGHOST) { $env:PGHOST } else { "127.0.0.1" }),
  [int]$Port = $(if ($env:PGPORT) { [int]$env:PGPORT } else { 5432 }),
  [string]$UserName = $env:PGUSER,
  [string]$PgRestorePath = $env:PGRESTORE_PATH,
  [switch]$Clean,
  [switch]$Yes
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

  throw "Could not find $ToolName. Set PGRESTORE_PATH or add PostgreSQL bin to PATH."
}

if (-not $Database) { throw "PGDATABASE or -Database is required." }
if (-not $UserName) { throw "PGUSER or -UserName is required." }
if (-not (Test-Path -LiteralPath $BackupFile)) { throw "Backup file not found: $BackupFile" }
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
  throw "Set PGPASSWORD or configure %APPDATA%\postgresql\pgpass.conf before running a restore."
}

if (-not $Yes) {
  Write-Host "Restore target: $Database on ${HostName}:$Port as $UserName"
  Write-Host "Backup file: $BackupFile"
  if ($Clean) {
    Write-Host "Clean mode is enabled. Existing database objects may be dropped before restore."
  }
  $confirmation = Read-Host "Type RESTORE to continue"
  if ($confirmation -ne "RESTORE") {
    throw "Restore cancelled."
  }
}

$pgRestore = Resolve-PostgresTool -ConfiguredPath $PgRestorePath -ToolName "pg_restore.exe"
$arguments = @(
  "--host", $HostName,
  "--port", $Port,
  "--username", $UserName,
  "--dbname", $Database,
  "--no-owner",
  "--no-acl"
)

if ($Clean) {
  $arguments += @("--clean", "--if-exists")
}

$arguments += $BackupFile

& $pgRestore @arguments

if ($LASTEXITCODE -ne 0) {
  throw "pg_restore failed with exit code $LASTEXITCODE."
}

Write-Host "PostgreSQL restore completed."
