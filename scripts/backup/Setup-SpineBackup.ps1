# Spine CRM backup - one-off setup on this PC. See README.md in this folder.
#
# Asks for the database connection details (from Supabase -> Connect ->
# Session pooler) and the database password, and where to save backups.
# The password is encrypted with Windows (DPAPI) so only this Windows user on
# this PC can read it. Nothing is written to the Spine code folder.

$ErrorActionPreference = 'Stop'

$ConfigDir = Join-Path $env:APPDATA 'SpineBackup'
New-Item -ItemType Directory -Force -Path $ConfigDir | Out-Null
$ConfigFile = Join-Path $ConfigDir 'config.json'
$PasswordFile = Join-Path $ConfigDir 'db-password.txt'

function Ask([string]$question, [string]$default) {
  $answer = Read-Host "$question [$default]"
  if ([string]::IsNullOrWhiteSpace($answer)) { return $default }
  return $answer.Trim()
}

Write-Host ''
Write-Host 'Spine CRM backup setup' -ForegroundColor Cyan
Write-Host 'In Supabase, open the Spine CRM project, click Connect, choose "Session pooler",'
Write-Host 'and copy the host and user from the connection details shown there.'
Write-Host ''

$existing = $null
if (Test-Path $ConfigFile) { $existing = Get-Content $ConfigFile -Raw | ConvertFrom-Json }

$defaultHost = if ($existing) { $existing.Host } else { 'aws-0-eu-west-1.pooler.supabase.com' }
$defaultUser = if ($existing) { $existing.User } else { 'postgres.qkdczucplehdaezprucv' }
$oneDrive = if ($env:OneDriveCommercial) { $env:OneDriveCommercial } elseif ($env:OneDrive) { $env:OneDrive } else { [Environment]::GetFolderPath('MyDocuments') }
$defaultDestination = if ($existing) { $existing.Destination } else { Join-Path $oneDrive 'Spine CRM backups' }
$defaultKeep = if ($existing) { [string]$existing.Keep } else { '12' }

$config = [ordered]@{
  Host        = Ask 'Host (Session pooler)' $defaultHost
  Port        = 5432
  User        = Ask 'User' $defaultUser
  Destination = Ask 'Save backups in' $defaultDestination
  Keep        = [int](Ask 'How many weekly backups to keep' $defaultKeep)
}

New-Item -ItemType Directory -Force -Path $config.Destination | Out-Null
$config | ConvertTo-Json | Set-Content -Path $ConfigFile -Encoding UTF8

if ((Test-Path $PasswordFile) -and ((Read-Host 'A password is already saved. Replace it? (y/N)') -notmatch '^[yY]')) {
  Write-Host 'Keeping the saved password.'
}
else {
  Write-Host 'Database password (Supabase -> Project Settings -> Database; reset it there if you do not have it):'
  $password = Read-Host 'Password' -AsSecureString
  $password | ConvertFrom-SecureString | Set-Content -Path $PasswordFile
  Write-Host 'Password saved (encrypted for this Windows user only).'
}

Write-Host ''
Write-Host "Settings saved to $ConfigDir" -ForegroundColor Green
Write-Host 'Next: run Backup-Spine.ps1 once to test it, then Register-SpineBackupTask.ps1 to run it weekly.'
