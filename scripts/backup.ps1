[CmdletBinding()]
param(
  [string]$BackupRoot = 'backups',
  [string]$MySqlRootPassword = $env:MYSQL_ROOT_PASSWORD
)

$ErrorActionPreference = 'Stop'
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = $utf8NoBom
$OutputEncoding = $utf8NoBom

if ([string]::IsNullOrWhiteSpace($MySqlRootPassword)) {
  throw 'Set MYSQL_ROOT_PASSWORD or pass -MySqlRootPassword before running the backup.'
}

$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$backupPath = if ([System.IO.Path]::IsPathRooted($BackupRoot)) { $BackupRoot } else { Join-Path $projectRoot $BackupRoot }
New-Item -ItemType Directory -Force -Path $backupPath | Out-Null

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$databaseFile = Join-Path $backupPath "hr-$stamp.sql"
$storageFile = Join-Path $backupPath "storage-$stamp.zip"
$manifestFile = Join-Path $backupPath "manifest-$stamp.json"
$privateStorage = Join-Path $projectRoot 'apps\api\storage\private'

Push-Location -LiteralPath $projectRoot
try {
  $sql = docker compose exec -T -e "MYSQL_PWD=$MySqlRootPassword" mysql mysqldump --single-transaction --routines --triggers --hex-blob -uroot hr_system
  if ($LASTEXITCODE -ne 0) { throw "mysqldump failed with exit code $LASTEXITCODE" }
  [System.IO.File]::WriteAllText($databaseFile, ($sql -join "`n"), (New-Object System.Text.UTF8Encoding($false)))

  if (Test-Path -LiteralPath $privateStorage) {
    $files = @(Get-ChildItem -LiteralPath $privateStorage -Force)
    if ($files.Count -gt 0) {
      Compress-Archive -Path (Join-Path $privateStorage '*') -DestinationPath $storageFile -Force
    }
  }

  $manifest = [ordered]@{
    createdAt = (Get-Date).ToUniversalTime().ToString('o')
    database = 'hr_system'
    databaseBackup = [System.IO.Path]::GetFileName($databaseFile)
    storageBackup = if (Test-Path -LiteralPath $storageFile) { [System.IO.Path]::GetFileName($storageFile) } else { $null }
    privateDocumentsIncluded = Test-Path -LiteralPath $storageFile
    syntheticDataOnly = $true
  }
  $manifest | ConvertTo-Json | Set-Content -LiteralPath $manifestFile -Encoding UTF8

  "Backup created in $backupPath"
  "Database: $([System.IO.Path]::GetFileName($databaseFile))"
  "Manifest: $([System.IO.Path]::GetFileName($manifestFile))"
}
finally {
  Pop-Location
}
