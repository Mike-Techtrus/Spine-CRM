# Getting Spine CRM running on your PC — step by step

This assumes you've never used a terminal before. Every step says exactly what to click or type.
You're on Windows, so these instructions are Windows-specific.

Roughly 30–40 minutes the first time, mostly waiting for installers and the Supabase project to
spin up.

---

## Step 1 — Install Node.js

Node.js is what runs the app on your PC. If you're not sure whether you already have it, you'll
find out in a second.

1. Go to **https://nodejs.org** in your browser.
2. Click the big green button — it'll say something like "Download Node.js (LTS)". LTS is the
   one you want.
3. Run the downloaded installer, click Next through it with the default options, and let it
   finish. Restart your PC if it asks you to.

---

## Step 2 — Unzip the project

1. Find the `spine-crm.zip` file I sent you (probably in your Downloads folder).
2. Right-click it → **Extract All…** → choose a folder you'll remember, e.g. your Documents
   folder → **Extract**.
3. You should now have a folder called `spine-crm` with files like `README.md`, `package.json`,
   and a `src` folder inside it. Keep that folder — don't move or rename it later, or you'll have
   to redo some of the steps below.

---

## Step 3 — Open a terminal in that folder

A terminal is just a window where you type commands instead of clicking.

1. Open the `spine-crm` folder in File Explorer.
2. Click once in the empty space in the address bar at the top (where it shows the folder path),
   type `powershell`, and press Enter.
3. A blue-ish window pops up. That's your terminal, already pointed at the right folder. Keep it
   open for the rest of these steps — you'll come back to it.

Check Node installed correctly: type this and press Enter:

```
node -v
```

You should see something like `v22.11.0`. If instead you see an error like "node is not
recognized", close the terminal, close File Explorer, and reopen both (Node needs a fresh window
to register) — then try again.

---

## Step 4 — Create your Supabase project

Supabase is where the app's data actually lives (think: the database behind the scenes).

1. Go to **https://supabase.com** and click **Start your project** → sign up (easiest: "Continue
   with GitHub" or "Continue with email").
2. Once logged in, click **New project**.
3. Fill in:
   - **Name**: `spine-crm` (or anything you'll recognise)
   - **Database password**: click "Generate a password", then **copy it somewhere safe** (a
     notes app) — you likely won't need it again, but keep it just in case.
   - **Region**: pick the one closest to you, e.g. **London (eu-west-2)**.
4. Click **Create new project**. This takes a minute or two — it's provisioning your database.
   Wait until the dashboard loads properly (you'll see a sidebar with icons).

---

## Step 5 — Set up the database tables

1. In the Supabase sidebar (left side), click the icon that looks like `</>` labelled **SQL
   Editor**.
2. Click **New query**.
3. Back in the `spine-crm` folder (File Explorer), open the `supabase` folder, then
   `migrations`, then open **`0001_init.sql`** with Notepad (right-click → Open with → Notepad).
4. Select all the text (Ctrl+A), copy it (Ctrl+C).
5. Back in the Supabase SQL Editor in your browser, click into the empty query box and paste
   (Ctrl+V).
6. Click the green **Run** button (bottom right, or Ctrl+Enter). You should see "Success. No rows
   returned" at the bottom.
7. Click **New query** again, and repeat steps 3–6 for **`0002_sales_pipeline.sql`** (the second
   file in that same folder).

If either run shows a red error instead of success, stop and send me the exact error text —
don't run the other one yet.

---

## Step 6 — Get your project's connection details

1. In the Supabase sidebar, click the gear icon ⚙️ **Project Settings**.
2. Click **API** in the settings menu.
3. You'll see **Project URL** (starts with `https://` and ends in `.supabase.co`) and under
   **Project API keys**, one labelled **anon** / **public**. You'll need both in the next step —
   keep this browser tab open.

---

## Step 7 — Tell the app how to find your Supabase project

1. In the `spine-crm` folder, find the file called **`.env.example`**. Copy it (Ctrl+C, Ctrl+V in
   the same folder), then rename the copy to **`.env.local`** (right-click → Rename).
   - If Windows won't let you start a filename with a dot, type `.env.local.` (with a trailing
     dot) — Windows will silently drop the trailing dot for you.
2. Open **`.env.local`** with Notepad.
3. Replace the placeholder values so it looks like this, using what you copied from Supabase in
   Step 6:
   ```
   VITE_SUPABASE_URL=https://your-actual-project-ref.supabase.co
   VITE_SUPABASE_ANON_KEY=your-actual-anon-key
   ```
4. Save the file (Ctrl+S) and close Notepad.

---

## Step 8 — Install and start the app

Back in the PowerShell terminal from Step 3 (if you closed it, reopen one the same way):

1. Type this and press Enter:
   ```
   npm install
   ```
   This downloads everything the app needs. Takes a minute or two; you'll see a lot of text
   scroll past — that's normal. Wait until you get your cursor back.
2. Then type this and press Enter:
   ```
   npm run dev
   ```
   You should see a message with a line like:
   ```
   ➜  Local:   http://localhost:5173/
   ```
3. Open that address (`http://localhost:5173`) in your browser. You should land on a sign-in
   page titled "Spine Timesheets".

Leave this terminal window open and running while you use the app — closing it stops the app.
Next time, you only need to repeat this step (not Steps 1–7) to start it again.

---

## Step 9 — Create your login

1. Back in the Supabase dashboard (browser tab from Step 6), sidebar → **Authentication** →
   **Users**.
2. Click **Add user** → **Create new user**.
3. Enter your email and a password you'll remember, leave "Auto Confirm User" ticked if it's
   shown, then click **Create user**.

   (Older guidance said to paste `{ "full_name": "...", "role": "staff" }` into a "User Metadata"
   box here — Supabase has moved or removed that box in some dashboard versions, so skip it and
   use the SQL step below instead, which works regardless.)
4. Sidebar → **SQL Editor** → **New query**, paste this in:
   ```sql
   update public.profiles
   set role = 'staff', full_name = 'Mike'
   where id = (select id from auth.users where email = 'YOUR-EMAIL-HERE');
   ```
5. Replace `YOUR-EMAIL-HERE` with the exact email you used in step 3 (keep the quotes), then click
   **Run**. You should see "Success. 1 rows affected."
6. Go back to the app in your browser (`http://localhost:5173/login`), sign in with that email
   and password.

You should land on the staff area with the sales pipeline and timesheets in the top nav. You're
in.

---

## If something doesn't work

Copy the exact error message — from the terminal, the browser, or Supabase — and send it to me
along with which step you were on. "It doesn't work" is hard to debug; the exact red text is
usually enough for me to spot it immediately.

## What's next

This gets you running **locally on your own PC** — good for trying it out and adding your real
accounts/clients. When you're ready to put it on the internet so your field engineers can reach
it too, that's Step 5 in the main `README.md` (deploying to Vercel) — happy to walk through that
the same way when you get there.
