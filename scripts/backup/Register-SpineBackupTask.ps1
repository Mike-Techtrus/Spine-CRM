# Spine CRM backup - adds a weekly Windows scheduled task that runs
# Backup-Spine.ps1. Runs as you, only while you're signed in (so no Windows
# password is stored). If the PC is off at the time, it runs at the next
# chance. Run again to change the day or time; see README.md to remove it.

param(
  [ValidateSet('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday')]
  [string]$Day = 'Friday',
  [string]$At = '12:30'
)

$ErrorActionPreference = 'Stop'

$script = Join-Path $PSScriptRoot 'Backup-Spine.ps1'
if (-not (Test-Path $script)) { throw "Can't find $script" }

$action = New-ScheduledTaskAction -Execute 'powershell.exe' `
  -Argument "-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$script`""
$trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek $Day -At $At
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RunOnlyIfNetworkAvailable `
  -ExecutionTimeLimit (New-TimeSpan -Hours 1)
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName 'Spine CRM backup' -Description 'Weekly copy of the Spine CRM database (scripts\backup in the Spine folder).' `
  -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null

Write-Host "Scheduled: every $Day at $At (or as soon as the PC is next on)." -ForegroundColor Green
Write-Host 'Check it any time in Task Scheduler -> Task Scheduler Library -> "Spine CRM backup".'
