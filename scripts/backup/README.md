# Spine CRM – weekly backup to your PC

The Supabase project is on the **Free plan, which has no automatic backups**. These scripts save a copy of the live database to a folder on your PC (your OneDrive by default) once a week, and keep the last 12 copies.

Nothing secret is stored in these files or anywhere in the Spine code folder. The database password is kept in your Windows profile, encrypted so that only your Windows login on this PC can read it.

**What's included:** every Spine table and its data (accounts, quotes, sales orders, invoices, timesheets, projects, people, skills…), plus the logins and the records of uploaded files.
**What's not included:** the uploaded files themselves (CVs, photos, ID documents). Supabase stores those outside the database.

## One-off setup (about 10 minutes)

### 1. Install the PostgreSQL tools

1. Go to <https://www.postgresql.org/download/windows/> and download the installer for **version 17 or newer**.
2. Run it. On the **Select Components** screen, tick only **Command Line Tools** and untick everything else. You don't need a database on your PC.
3. Click through to the end.

### 2. Get the connection details from Supabase

1. Open the **Spine CRM** project in Supabase and click **Connect** at the top.
2. Choose **Session pooler**.
3. Note the **host** (something like `aws-0-eu-west-1.pooler.supabase.com`) and the **user** (`postgres.qkdczucplehdaezprucv`).
4. You'll also need the **database password**. If you don't have it, reset it under **Project Settings → Database**. Resetting it doesn't affect the Spine app.

### 3. Run the setup

Open PowerShell and run:

```powershell
cd "$HOME\Documents\spine-crm\scripts\backup"
powershell -ExecutionPolicy Bypass -File .\Setup-SpineBackup.ps1
```

Press Enter to accept a suggested answer, or type your own. Paste the host and user from step 2, then type the password when asked. The password is hidden as you type.

### 4. Test it

```powershell
powershell -ExecutionPolicy Bypass -File .\Backup-Spine.ps1
```

You should see `OK - NN tables saved` and a new `spine-YYYY-MM-DD_HHmm` folder in your backups folder.

### 5. Schedule it weekly

```powershell
powershell -ExecutionPolicy Bypass -File .\Register-SpineBackupTask.ps1
```

This runs every **Friday at 12:30**. If the PC is off then, it runs as soon as you're next signed in. To pick another time, for example Monday at 9:00:

```powershell
powershell -ExecutionPolicy Bypass -File .\Register-SpineBackupTask.ps1 -Day Monday -At 09:00
```

## Checking it's working

- **`LAST-BACKUP.txt`** in your backups folder always shows the result of the latest run.
- Task Scheduler → Task Scheduler Library → **Spine CRM backup** shows when it last ran.

## If something changes

- **Database password reset:** run `Setup-SpineBackup.ps1` again and answer `y` to replace the saved password.
- **Remove the weekly task:**
  ```powershell
  Unregister-ScheduledTask -TaskName 'Spine CRM backup' -Confirm:$false
  ```
- **Remove the saved settings and password:** delete the folder `%APPDATA%\SpineBackup`.

## Restoring

Don't restore over the live project yourself. Ask Claude, or someone technical, to help. The usual approach is:

1. Create a **new** Supabase project.
2. Restore `spine-public.dump` into it with `pg_restore`.
3. Restore `spine-auth-storage.dump` if the logins are needed too.
4. Compare the restored project with the live one, then decide what to copy back.

Practising this once, on a spare project, is the best way to know the backups really work.
