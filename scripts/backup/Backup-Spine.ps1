# Spine CRM - weekly off-site database backup.
#
# Saves a copy of the live Supabase database to a folder on this PC (by
# default your OneDrive), keeps the most recent copies and deletes older ones.
# Run Setup-SpineBackup.ps1 once first; Register-SpineBackupTask.ps1 then runs
# this every week. See README.md in this folder.
#
# Nothing secret is stored in this file (the repository is public). The
# database password lives in this Windows user's profile, encrypted so only
# this user on this PC can read it.
#
# Each backup is a folder named spine-YYYY-MM-DD_HHmm containing:
#   spine-public.dump   - all Spine tables and their data (pg_dump custom format)
#   spine-auth-storage.dump - logins (auth) and file records (storage), data only
#   backup.log          - what happened
# Uploaded files themselves (CVs, photos, ID documents) are NOT included -
# Supabase keeps those separately from the database.

[CmdletBinding()]
param(
  [int]$Keep = 0 # how many backups to keep; 0 = use the number chosen in setup
)

$ErrorActionPreference = 'Stop'

$ConfigDir = Join-Path $env:APPDATA 'SpineBackup'
$ConfigFile = Join-Path $ConfigDir 'config.json'
$PasswordFile = Join-Path $ConfigDir 'db-password.txt'

if (-not (Test-Path $ConfigFile) -or -not (Test-Path $PasswordFile)) {
  throw "Spine backup isn't set up on this PC yet. Run Setup-SpineBackup.ps1 first."
}

$config = Get-Content $ConfigFile -Raw | ConvertFrom-Json
if ($Keep -le 0) { $Keep = [int]$config.Keep }
if ($Keep -le 0) { $Keep = 12 }

# Find pg_dump: on the PATH, or the newest PostgreSQL install in Program Files.
function Find-PgTool([string]$name) {
  $onPath = Get-Command "$name.exe" -ErrorAction SilentlyContinue
  if ($onPath) { return $onPath.Source }
  $installs = Get-ChildItem 'C:\Program Files\PostgreSQL' -Directory -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -match '^\d+$' } |
    Sort-Object { [int]$_.Name } -Descending
  foreach ($dir in $installs) {
    $candidate = Join-Path $dir.FullName "bin\$name.exe"
    if (Test-Path $candidate) { return $candidate }
  }
  throw "Couldn't find $name.exe. Install the PostgreSQL 17 (or newer) command-line tools - see README.md."
}

$pgDump = Find-PgTool 'pg_dump'
$pgRestore = Find-PgTool 'pg_restore'

$stamp = Get-Date -Format 'yyyy-MM-dd_HHmm'
$destination = Join-Path $config.Destination "spine-$stamp"
New-Item -ItemType Directory -Force -Path $destination | Out-Null
$log = Join-Path $destination 'backup.log'

function Write-Log([string]$message) {
  $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $message"
  Add-Content -Path $log -Value $line
  Write-Host $line
}

# Decrypt the password just for this run (Windows DPAPI - this user only).
$secure = Get-Content $PasswordFile | ConvertTo-SecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
$failed = $false

try {
  $env:PGPASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  $env:PGSSLMODE = 'require'
  $connection = @('--host', $config.Host, '--port', [string]$config.Port, '--username', $config.User, '--dbname', 'postgres')

  Write-Log "Backing up Spine CRM ($($config.Host)) with $pgDump"

  # PowerShell 5.1 treats anything a program writes to its error stream as an
  # error, so relax that while the PostgreSQL tools run; exit codes decide.
  $ErrorActionPreference = 'Continue'

  # 1. Spine's own tables, functions and data.
  $publicFile = Join-Path $destination 'spine-public.dump'
  $out = & $pgDump @connection --schema public --format custom --no-owner --no-privileges --file $publicFile 2>&1
  $out | ForEach-Object { Write-Log "pg_dump: $_" }
  if ($LASTEXITCODE -ne 0) { throw "pg_dump of the Spine tables failed (exit code $LASTEXITCODE)." }

  # 2. Logins and file records - data only (Supabase creates these tables itself).
  $authFile = Join-Path $destination 'spine-auth-storage.dump'
  $out = & $pgDump @connection --schema auth --schema storage --data-only --format custom --no-owner --no-privileges --file $authFile 2>&1
  $out | ForEach-Object { Write-Log "pg_dump: $_" }
  if ($LASTEXITCODE -ne 0) { throw "pg_dump of logins and file records failed (exit code $LASTEXITCODE)." }

  # 3. Check the main file can be read back, and count what's in it.
  $contents = & $pgRestore --list $publicFile 2>&1
  if ($LASTEXITCODE -ne 0) { throw "The backup file couldn't be read back (exit code $LASTEXITCODE)." }
  $ErrorActionPreference = 'Stop'
  $tables = ($contents | Select-String ' TABLE DATA public ').Count
  $sizeMb = [math]::Round(((Get-Item $publicFile).Length + (Get-Item $authFile).Length) / 1MB, 2)
  Write-Log "OK - $tables tables saved, $sizeMb MB, in $destination"
}
catch {
  $failed = $true
  Write-Log "FAILED - $($_.Exception.Message)"
}
finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
}

# Keep the newest $Keep successful backups; only ever touches spine-* folders made by this script.
if (-not $failed) {
  $old = Get-ChildItem $config.Destination -Directory |
    Where-Object { $_.Name -match '^spine-\d{4}-\d{2}-\d{2}_\d{4}$' -and (Test-Path (Join-Path $_.FullName 'spine-public.dump')) } |
    Sort-Object Name -Descending |
    Select-Object -Skip $Keep
  foreach ($folder in $old) {
    Remove-Item $folder.FullName -Recurse -Force
    Write-Log "Removed old backup $($folder.Name)"
  }
}

# A summary file in the backup folder makes it easy to see the last result.
$summary = Join-Path $config.Destination 'LAST-BACKUP.txt'
Set-Content -Path $summary -Encoding UTF8 -Value ((Get-Content $log) -join [Environment]::NewLine)

if ($failed) { exit 1 }
