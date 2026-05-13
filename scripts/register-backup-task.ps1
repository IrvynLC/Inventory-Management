param(
  [string]$TaskName = "Inventory Management PostgreSQL Backup",
  [string]$ProjectDirectory = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path,
  [string]$At = "23:00",
  [string]$Database = $(if ($env:PGDATABASE) { $env:PGDATABASE } else { "inventory_management" }),
  [string]$HostName = $(if ($env:PGHOST) { $env:PGHOST } else { "127.0.0.1" }),
  [int]$Port = $(if ($env:PGPORT) { [int]$env:PGPORT } else { 5432 }),
  [string]$UserName = $(if ($env:PGUSER) { $env:PGUSER } else { "inventory_app" }),
  [string]$BackupDirectory = (Join-Path $ProjectDirectory "backups\postgres"),
  [int]$RetentionDays = 30
)

$ErrorActionPreference = "Stop"

$backupScript = Join-Path $ProjectDirectory "scripts\backup-postgres.ps1"
if (-not (Test-Path -LiteralPath $backupScript)) {
  throw "Backup script not found: $backupScript"
}

$logDirectory = Join-Path $ProjectDirectory "logs"
New-Item -ItemType Directory -Force -Path $logDirectory | Out-Null
$taskLog = Join-Path $logDirectory "postgres-backup-task.log"
$time = [datetime]::ParseExact($At, "HH:mm", $null)
$backupCommand = @(
  "&",
  "`"$backupScript`"",
  "-Database", "`"$Database`"",
  "-HostName", "`"$HostName`"",
  "-Port", $Port,
  "-UserName", "`"$UserName`"",
  "-BackupDirectory", "`"$BackupDirectory`"",
  "-RetentionDays", $RetentionDays,
  "*>>", "`"$taskLog`""
) -join " "

$argumentList = @(
  "-NoProfile",
  "-ExecutionPolicy", "Bypass",
  "-Command", "`"$backupCommand`""
) -join " "

$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $argumentList -WorkingDirectory $ProjectDirectory
$trigger = New-ScheduledTaskTrigger -Daily -At $time
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 2)

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Description "Daily PostgreSQL backup for Inventory Management." -Force | Out-Null

Write-Host "Scheduled task registered: $TaskName"
Write-Host "Run time: $At daily"
Write-Host "Backup directory: $BackupDirectory"
Write-Host "Task log: $taskLog"
Write-Host "Important: ensure PostgreSQL authentication works for the task account using PGPASSWORD or pgpass.conf."
