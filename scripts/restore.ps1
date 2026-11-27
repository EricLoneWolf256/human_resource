[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$BackupRoot,
  [string]$MySqlRootPassword = $env:MYSQL_ROOT_PASSWORD,
  [switch]$ConfirmRestore
)

$ErrorActionPreference = 'Stop'
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = $utf8NoBom
$OutputEncoding = $utf8NoBom

if (-not $ConfirmRestore) {
  throw 'Pass -ConfirmRestore to acknowledge that the target hr_system database will be overwritten.'
}
if ([string]::IsNullOrWhiteSpace($MySqlRootPassword)) {
  throw 'Set MYSQL_ROOT_PASSWORD or pass -MySqlRootPassword before running the restore.'
}

$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$backupPath = (Resolve-Path -LiteralPath $BackupRoot).Path
$manifestFile = Get-ChildItem -LiteralPath $backupPath -Filter 'manifest-*.json' -File | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $manifestFile) { throw "No manifest-*.json backup manifest found in $backupPath" }

$manifest = Get-Content -LiteralPath $manifestFile.FullName -Raw -Encoding UTF8 | ConvertFrom-Json
$databaseFile = Join-Path $backupPath $manifest.databaseBackup
if (-not (Test-Path -LiteralPath $databaseFile)) { throw "Database backup $($manifest.databaseBackup) is missing" }

$privateStorage = Join-Path $projectRoot 'apps\api\storage\private'
$storageFile = $null
if ($manifest.storageBackup) {
  $storageFile = Join-Path $backupPath $manifest.storageBackup
  if (-not (Test-Path -LiteralPath $storageFile)) { throw "Storage backup $($manifest.storageBackup) is missing" }
}

Push-Location -LiteralPath $projectRoot
try {
  docker compose up -d --wait mysql
  if ($LASTEXITCODE -ne 0) { throw "Could not start MySQL (exit code $LASTEXITCODE)" }

  Get-Content -LiteralPath $databaseFile -Raw -Encoding UTF8 | docker compose exec -T -e "MYSQL_PWD=$MySqlRootPassword" mysql -uroot hr_system
  if ($LASTEXITCODE -ne 0) { throw "Database restore failed with exit code $LASTEXITCODE" }

  if ($storageFile) {
    New-Item -ItemType Directory -Force -Path $privateStorage | Out-Null
    Get-ChildItem -LiteralPath $privateStorage -Force | Remove-Item -Recurse -Force
    Expand-Archive -LiteralPath $storageFile -DestinationPath $privateStorage -Force
  }

  $health = docker compose exec -T -e "MYSQL_PWD=$MySqlRootPassword" mysql -uroot -N -e 'SELECT COUNT(*) FROM hr_system.Employee;'
  "Restore complete. Employee rows: $($health -join '')"
}
finally {
  Pop-Location
}
