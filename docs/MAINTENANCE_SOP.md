# CareSync — Maintenance & Update SOP

This document defines standard operating procedures for maintaining, updating,
and troubleshooting the CareSync application. It is intended for developers
and administrators responsible for keeping the app running reliably.

---

## 1. AI Model Updates (Gemini)

### Why this needs attention
Google periodically deprecates older Gemini model versions and releases
improved ones. When a model is deprecated, the Scan AVS feature will return
a 502 error until the model name is updated.

### How to update — no code change required

The model name is controlled entirely by an environment variable. When Google
releases a new model:

**Local development:**
1. Open `.env` in the project root
2. Update the value: `GEMINI_MODEL=gemini-X.X-flash` (new model name)
3. Restart `netlify dev`

**Production (Netlify):**
1. Log in to [app.netlify.com](https://app.netlify.com)
2. Navigate to: Site → Site Settings → Environment Variables
3. Find `GEMINI_MODEL` and update its value to the new model name
4. Click **Save** — takes effect immediately on the next function invocation

**Fallback default:** If `GEMINI_MODEL` is not set, the app falls back to
`gemini-2.5-flash` (defined in `netlify/functions/process-avs.ts` line ~32).

### How to verify the current model name
Check [Google AI Studio models](https://ai.google.dev/gemini-api/docs/models)
for the current list of supported models. Look for the latest `flash` variant
for the best cost/performance balance.

### Files involved
| File | What it does |
|---|---|
| `netlify/functions/process-avs.ts` | Reads `GEMINI_MODEL` env var, falls back to hardcoded default |
| `.env` | Local development model override |
| Netlify dashboard | Production model override |

---

## 2. Gemini API Key Rotation

### When to rotate
- Suspected key compromise
- Staff/developer offboarding
- Google-recommended rotation schedule (annually as best practice)

### How to rotate

1. Go to [Google AI Studio](https://aistudio.google.com) → API Keys
2. Generate a new key
3. **Before deleting the old key**, update both environments:

**Local:**
- Open `.env`
- Replace `CARESYNC_GEMINI_KEY=` value with the new key

**Production (Netlify):**
- Site Settings → Environment Variables → `CARESYNC_GEMINI_KEY`
- Update value → Save

4. Verify Scan AVS works with the new key
5. Delete the old key in Google AI Studio

> **Why `CARESYNC_GEMINI_KEY` and not `GEMINI_API_KEY`?**
> Netlify automatically injects its own `GEMINI_API_KEY` variable for its
> managed AI service, which would override a standard name. The `CARESYNC_`
> prefix avoids this collision.

---

## 3. npm Package Updates

### Frequency
- Review monthly or before any major feature release
- Always update before a public launch

### Commands
```bash
# Check for outdated packages
npm outdated

# Update all packages within their declared semver range
npm update

# Check for security vulnerabilities
npm audit

# Fix automatically fixable vulnerabilities
npm audit fix
```

### High-priority packages to watch
| Package | Why it matters |
|---|---|
| `@google/generative-ai` | Gemini SDK — new models may require newer SDK versions |
| `@supabase/supabase-js` | Auth and database client — security patches are critical |
| `@netlify/functions` | Serverless function types — update when deploying new functions |

### After updating
Always run `npx tsc --noEmit` to verify no TypeScript errors were introduced,
then test Scan AVS end-to-end before deploying.

---

## 4. Profile Photo Storage (Supabase Storage)

### One-time setup required before this feature works in production
The profile photo upload feature requires an `avatars` bucket in Supabase Storage.
This must be created manually in the Supabase dashboard — it is NOT created
automatically by the app.

**Steps (one-time, per environment):**

**Part A — Create the bucket:**
1. Go to your Supabase project dashboard
2. Navigate to **Storage** in the left sidebar
3. Click **New bucket**
4. Name it exactly: `avatars`
5. Toggle **Public bucket** → ON
6. Click **Save**

**Part B — Add policies via SQL Editor:**
> Do NOT use the Storage policy UI — it changes frequently and fields may
> be missing. The SQL Editor is reliable and always works.

1. Left sidebar → **SQL Editor** → **New query**
2. Paste and run the following:

```sql
-- Allow authenticated users to upload their own avatar
CREATE POLICY "Users can upload their own avatar"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'avatars'
  AND name = (auth.uid()::text || '.jpg')
);

-- Allow authenticated users to overwrite their own avatar
CREATE POLICY "Users can update their own avatar"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'avatars'
  AND name = (auth.uid()::text || '.jpg')
)
WITH CHECK (
  bucket_id = 'avatars'
  AND name = (auth.uid()::text || '.jpg')
);

-- Allow public read (required for getPublicUrl to work)
CREATE POLICY "Public read access for avatars"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'avatars');
```

3. Confirm all three policies appear under **Storage → avatars → Policies**

**File path pattern:** `avatars/{userId}.jpg`
Each user has exactly one file named after their UUID. Uploading a new
photo overwrites the previous one automatically (`upsert: true`).

### Photo upload flow
Users tap their avatar circle in Settings to upload a new photo. The app:
1. Validates the file (rejects HEIC on desktop, rejects files over 15 MB)
2. Compresses and centre-crops to 256×256 JPEG in the browser (no server cost)
3. Shows a confirmation preview dialog — user must tap "Use Photo" to commit
4. Uploads to Supabase Storage, updates the `profiles.avatar_url` column
5. Fires a `caresync:profile-updated` browser event that refreshes avatars
   everywhere in the app simultaneously (sidebar, header, member list, updates)

### Supported upload formats
JPEG, PNG, WebP, HEIC, HEIF, and PDF are all accepted without any conversion
required from the user. JPEG, PNG, and WebP are compressed client-side via
canvas before upload. HEIC, HEIF, and PDF are passed through as-is to Gemini,
which handles them natively as inline data types.

### Storage limits
- Supabase free tier: 1GB total storage
- Average compressed avatar: ~30–50KB (256×256 JPEG)
- 1GB supports ~20,000+ users before any storage cost
- Each upload overwrites the previous file — no accumulation over time

---

## 5. Supabase Maintenance

### Environment variables (ten required)
| Variable | Used by | Where set |
|---|---|---|
| `VITE_SUPABASE_URL` | React app (browser bundle) | `.env` (baked in at build time) |
| `VITE_SUPABASE_ANON_KEY` | React app (browser bundle) | `.env` (baked in at build time) |
| `VITE_AVS_DAILY_SCAN_LIMIT` | Scan AVS counter display | `.env` (baked in at build time) — must match `AVS_DAILY_SCAN_LIMIT` |
| `SUPABASE_URL` | Netlify functions (server) | `.env` + Netlify dashboard |
| `SUPABASE_ANON_KEY` | Netlify functions (server) | `.env` + Netlify dashboard |
| `CARESYNC_GEMINI_KEY` | `process-avs` function | `.env` + Netlify dashboard |
| `GEMINI_MODEL` | `process-avs` function | `.env` + Netlify dashboard |
| `APP_URL` | Netlify functions (CORS origin) | `.env` (`http://localhost:8888` for local dev) + Netlify dashboard (Cloudflare Workers URL, no trailing slash). Note that .env is gitignored so the local value won't be pushed to Github Repo; the production APP_URL (your Cloudflare Workers URL) remains set only in the Netlify dashboard. |
| `SUPABASE_SERVICE_ROLE_KEY` | `delete-account` function only | Netlify dashboard only — **never** in `.env` or browser |
| `AVS_DAILY_SCAN_LIMIT` | `process-avs` rate limiter | Netlify dashboard (optional — defaults to `10` if unset) |

> `SUPABASE_SERVICE_ROLE_KEY` bypasses Row Level Security and must never be
> exposed to the browser or committed to source control. Set it only in the
> Netlify dashboard. It is required for the Delete Account feature to call
> `auth.admin.deleteUser()` on the user's behalf.

> The `VITE_` prefix makes a variable accessible in the browser bundle.
> Variables without it are server-only and never exposed to users.
> Because the frontend is deployed from a local build, `VITE_` values are
> baked in from `.env` at build time — not from any cloud dashboard.

### Supabase project URL/key change
If the Supabase project is migrated or recreated, update `.env` locally,
rebuild (`npm run build`), and redeploy (`npx wrangler deploy`). Also update
`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` in the
Netlify dashboard. Re-run all SQL files in order (Section 7 step 1–4) and
re-create the `avatars` bucket (Section 4) in the new Supabase project.

### Row Level Security (RLS)
RLS policies must be verified any time the database schema changes. A
misconfigured RLS policy could expose one user's care data to another.
Verify policies in: Supabase Dashboard → Authentication → Policies.

**Policies added post-launch (already in schema.sql as of v1.1):**
- `profiles: read circle peers` — allows users to read profiles of care circle
  co-members. Required for member names, avatars, and "completed by" labels to
  display correctly for other users.
- `members: admin can update` — allows admins to change member roles. Without
  this, the role dropdown in Settings silently does nothing.

**Policies added via `avs_scan_rate_limit.sql`:**
- `users can log own scans` — allows authenticated users to INSERT their own rows into `avs_scan_logs`. Required for the rate limiter in `process-avs` to record each scan using the caller's JWT.
- `users can read own scan logs` — allows users to SELECT their own rows. Required for the in-app scan counter on the Scan AVS page.

### Realtime configuration
Four tables must be enrolled in the `supabase_realtime` publication for
live cross-device sync to work. This is handled in `schema.sql` Section 7,
but if you ever need to re-apply it manually:

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE public.calendar_events;
ALTER PUBLICATION supabase_realtime ADD TABLE public.broadcast_updates;
ALTER PUBLICATION supabase_realtime ADD TABLE public.care_circle_members;
ALTER TABLE public.care_circle_members REPLICA IDENTITY FULL;
```

> `REPLICA IDENTITY FULL` on `care_circle_members` is required so that
> filtered subscriptions on `user_id` (non-primary-key column) receive
> UPDATE events correctly. Without it, role change notifications don't
> reach the affected user.

> **Supabase dashboard replication UI:** The UI for managing replication
> table enrollment is unreliable and changes between dashboard versions.
> Always use the SQL Editor for this configuration.

> **Supabase Storage policy UI:** Similarly, the Storage policy editor UI
> is unreliable. Always use the SQL Editor (see Section 4).

---

## 6. Deployment Architecture

CareSync uses a split deployment model:

| Layer | Platform | URL | What it does |
|---|---|---|---|
| Frontend + SSR | Cloudflare Workers | `caresync.*.workers.dev` | Serves the React app |
| Serverless functions | Netlify Functions | `caresync-ericmiao3.netlify.app` | `process-avs` (Gemini) + `delete-account` + `health` |
| Database + Auth | Supabase | `*.supabase.co` | Stores all app data |

### Health check
The Netlify functions layer exposes a public liveness endpoint:

```
GET https://caresync-ericmiao3.netlify.app/.netlify/functions/health
```

Returns `{ "status": "ok", "service": "caresync-netlify", "timestamp": "..." }` with HTTP 200 while healthy. No authentication required. Connect this URL to an external monitor (e.g. UptimeRobot — free tier, 5-minute polling) to receive alerts if the functions layer goes down.

**Why split?** The app is built on TanStack Start which outputs a Cloudflare
Worker bundle (SSR). Netlify cannot run Worker bundles. The Scan AVS function
stays on Netlify because it was already working there and requires no changes.

### Deployment checklist — before every release

**Frontend (Cloudflare Workers):**
- [ ] `npx tsc --noEmit` returns no TypeScript errors
- [ ] `.env` has correct values for all `VITE_` variables
- [ ] `VITE_AVS_ENDPOINT` points to the Netlify function URL
- [ ] `VITE_AVS_DAILY_SCAN_LIMIT` matches `AVS_DAILY_SCAN_LIMIT` in Netlify dashboard
- [ ] `npm run build` completes without errors
- [ ] `npx wrangler deploy` succeeds

**Scan AVS function (Netlify):**
- [ ] `netlify dev` works locally (tests the function end-to-end)
- [ ] Netlify dashboard env vars are set:
  - `CARESYNC_GEMINI_KEY`
  - `GEMINI_MODEL`
  - `SUPABASE_URL`
  - `SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY` (required by `delete-account` — never commit to source control)
  - `APP_URL` (must equal the Cloudflare Workers URL — no trailing slash)
  - `AVS_DAILY_SCAN_LIMIT` (optional — defaults to `10` if unset)

### Deploying a code change
```bash
# 1. Make and test your changes locally
netlify dev

# 2. Build
npm run build

# 3. Deploy frontend to Cloudflare
npx wrangler deploy

# 4. If Netlify function changed, push to GitHub
# (Netlify auto-deploys from the main branch)
git push origin main
```

### If the Cloudflare URL ever changes
Update `APP_URL` in the Netlify dashboard to the new URL and trigger a
Netlify redeploy. The old URL will stop working for Scan AVS immediately.

---

## 6.5 Switching Netlify Accounts

### When to switch
- Free tier credits exhausted on the current Netlify account
- Account ownership transfer (handing the project to another developer)
- Security incident requiring account isolation

### Why this is non-trivial
The Netlify subdomain changes (e.g. `caresync-ericmiao.netlify.app` → `caresync-ericmiao2.netlify.app`), which has three cascading effects:

1. **Every environment variable** in the new Netlify dashboard must be re-entered — there is no automatic copy from the old account.
2. **`VITE_AVS_ENDPOINT` is baked into the Cloudflare build at compile time** — the live frontend will keep calling the old Netlify URL until rebuilt and redeployed.
3. **`APP_URL` (CORS origin) must point to the Cloudflare Workers URL, NOT the new Netlify URL** — getting this wrong silently rejects every Scan AVS request with a "Failed to fetch" error, even though the function itself is healthy.

### Step-by-step procedure

**1. Create the new Netlify site + link the GitHub repo**
- Sign up or log into the new Netlify account
- Add new site → Import from Git → authorize GitHub → select the `caresync` repo
- Netlify auto-deploys the functions from the `main` branch — no build settings change needed (Netlify only runs the functions, not the frontend)

**2. Set all environment variables in the new Netlify dashboard** (Site Settings → Environment Variables):

> **Tip — bulk import:** Instead of entering variables one by one, go to Environment Variables → **Add variables → Import from a .env file** and paste the contents of a `netlify.env` file containing all server-side vars. Alternatively, run `netlify env:import netlify.env` via the Netlify CLI. Keep a `netlify.env` file locally (never commit it — it contains secrets) with all seven server-side variables pre-filled for fast re-use on the next account switch.

| Variable | Value source |
|---|---|
| `SUPABASE_URL` | Same as old account (Supabase dashboard → Settings → API) |
| `SUPABASE_ANON_KEY` | Same as old account |
| `SUPABASE_SERVICE_ROLE_KEY` | Same as old account |
| `CARESYNC_GEMINI_KEY` | Same as old account |
| `GEMINI_MODEL` | Same as old account (e.g. `gemini-2.5-flash`) |
| `APP_URL` | **Your Cloudflare Workers URL, no trailing slash** (NOT the new Netlify URL) |
| `AVS_DAILY_SCAN_LIMIT` | Same as old account (optional — defaults to `10`) |

**3. Update `VITE_AVS_ENDPOINT` in the local `.env`** to the new Netlify functions URL:
```
VITE_AVS_ENDPOINT=https://[new-netlify-subdomain].netlify.app/.netlify/functions/process-avs
```

**4. Rebuild and redeploy the Cloudflare frontend**:
```bash
npm run build
npx wrangler deploy
```

**5. Verify the migration**:
- Hit the health endpoint of the new Netlify site:
  ```
  https://[new-netlify-subdomain].netlify.app/.netlify/functions/health
  ```
  Should return `{"status":"ok","service":"caresync-netlify",...}`
- Open the live app, log in, and run a Scan AVS end-to-end against a real patient
- If Scan AVS fails with "Failed to fetch" but the health endpoint returns OK → see troubleshooting below

**6. Decommission the old Netlify site** (only after the new one is verified end-to-end)

### Troubleshooting

**Symptom: Scan AVS returns "Failed to fetch" after migration**

1. Hit the health endpoint of the new Netlify site. If it returns `{"status":"ok"}`, the functions themselves are running fine — the problem is almost always CORS-related.
2. Inspect `APP_URL` in the new Netlify dashboard. Three common mistakes:
   - Set to the **new Netlify URL** (e.g. `https://caresync-xxx.netlify.app`) instead of the Cloudflare Workers URL — Netlify sometimes pre-fills this. **Wrong.**
   - **Has a trailing slash** — must be removed (the CORS origin check compares strings exactly)
   - Left as `http://localhost:8888` from local-dev — never updated to production
3. Set `APP_URL` to the **Cloudflare Workers URL** with **no trailing slash**, then trigger a Netlify redeploy (Deploys → Trigger deploy → Deploy site). Test Scan AVS again.

**Symptom: app still calls the old Netlify URL after migration**

`VITE_AVS_ENDPOINT` is baked into the Cloudflare build at compile time. If you updated `.env` but didn't rebuild and redeploy, the live app keeps pointing at the old URL. Run `npm run build && npx wrangler deploy` and the new URL takes effect within seconds.

---

## 7. Local Development Setup (New Developer Onboarding)

```bash
# 1. Clone the repository
git clone https://github.com/ericmiaoai/caresync
cd caresync

# 2. Install dependencies
npm install

# 3. Create .env from this template
# (obtain actual values from the project lead)
VITE_SUPABASE_URL=https://[project].supabase.co
VITE_SUPABASE_ANON_KEY=[anon key]
SUPABASE_URL=https://[project].supabase.co
SUPABASE_ANON_KEY=[anon key]
CARESYNC_GEMINI_KEY=[gemini api key]
GEMINI_MODEL=gemini-2.5-flash
VITE_VLM_PROVIDER=api
APP_URL=http://localhost:8888
# SUPABASE_SERVICE_ROLE_KEY — set in Netlify dashboard only, NOT here

# 4. Install Netlify CLI
npm install -g netlify-cli

# 5. Start the full local dev environment (app + functions)
netlify dev

# 6. Open http://localhost:8888
```

### One-time Supabase setup (new project only)
If setting up against a brand-new Supabase project:
1. Run `supabase/schema.sql` in the SQL Editor
2. Run `supabase/create_care_circle_fn.sql` in the SQL Editor
3. Run `supabase/add_completion_fields.sql` in the SQL Editor
4. Run `supabase/avs_scan_rate_limit.sql` in the SQL Editor (creates `avs_scan_logs` table + RLS policies for the Scan AVS rate limiter)
5. Run `supabase/add_patient_profile_fields.sql` in the SQL Editor (adds Care Recipient fields, enrolls patients in realtime, adds patient-photo storage policies)
6. Create the `avatars` storage bucket (Section 4 of this document)

---

## 8. Status Indicators & User Notifications

CareSync displays two status banners at the top of the screen to keep users informed about connectivity and sync issues:

### "You're offline" Banner (Amber)
**Appearance:** Amber banner with WiFi Off icon
**Message:** "You're offline — changes are paused until connectivity is restored."

**When it appears:**
- Browser detects loss of network connectivity (via `navigator.onLine` or network events)

**User experience:**
- All data-mutating operations (create, update, delete) are blocked with a toast message
- Read operations continue from cached data
- Banner disappears automatically when network is restored

**What users should do:**
- Check their internet connection (WiFi, mobile data)
- No action needed once connectivity is restored — the app continues automatically

**Implementation:** `src/hooks/useOnlineStatus.ts` and `src/routes/__root.tsx` (`OfflineBanner` component)

---

### "Live sync interrupted" Banner (Amber)
**Appearance:** Amber banner with Refresh icon
**Message:** "Live sync interrupted — data may be delayed. Refresh the page to reconnect."

**When it appears:**
- At least one Supabase realtime subscription fails to connect or times out (after ~40-45 seconds)
- Common triggers: extended network failure, Supabase service unavailability, firewall blocking WebSocket connections

**User experience:**
- Data is **not** lost — REST queries (create, update, delete) continue to work
- **Real-time updates are paused** — changes made by other users in the care circle may not appear until the banner clears
- The banner appears ~40-45 seconds after network loss (longer than the offline banner because Supabase waits for subscription timeout)
- Banner automatically disappears when realtime subscriptions successfully reconnect (~5-7 seconds after network restored)

**What users should do:**
- If banner persists > 2 minutes: refresh the page or restart the app
- Check network connectivity (same as offline scenario)
- If issue persists after refresh: check the browser console (F12 → Console tab) for error messages and contact support

**Implementation:**
- `src/lib/realtimeSyncStore.ts` — module-level store tracking subscription health
- All 7 realtime subscription hooks report status via `setChannelStatus()`
- `src/routes/__root.tsx` (`SyncErrorBanner` component)
- Console errors logged with format: `[hookName] Realtime channel error (STATUS): ...`

**Why two separate banners?**
- **Offline banner:** Catches immediate network loss (browser-level)
- **Sync banner:** Catches server-side issues and slow reconnections (Supabase-level)
- Together they give users complete visibility into connectivity at both layers

---

## 9. Known Maintenance Triggers

| Event | Action required |
|---|---|
| Google deprecates current Gemini model | Update `GEMINI_MODEL` env var (Section 1) |
| `@google/generative-ai` releases new major version | Update package, test Scan AVS |
| Supabase rotates anon key | Update `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` in `.env` and Netlify dashboard |
| Supabase rotates service role key | Update `SUPABASE_SERVICE_ROLE_KEY` in Netlify dashboard only |
| New developer joins team | Follow Section 7 onboarding |
| Netlify free tier limit approached / new account needed | Both `process-avs` and `delete-account` run on Netlify. Migrate by following **Section 6.5 — Switching Netlify Accounts** |
| Scan AVS daily limit needs adjusting | Update `AVS_DAILY_SCAN_LIMIT` in Netlify dashboard (enforces the new limit) AND update `VITE_AVS_DAILY_SCAN_LIMIT` in local `.env` then `npm run build && npx wrangler deploy` (updates the display counter) |
| Users receiving unexpected 429 on Scan AVS | Check `avs_scan_logs` table in Supabase for the user's recent rows; verify RLS policies from `avs_scan_rate_limit.sql` are applied |
| Viewer can access Scan AVS | Verify `can(role, "scan_avs")` in `src/lib/permissions.ts` and role check in `netlify/functions/process-avs.ts` |
| Cloudflare Workers free tier limit approached | 100,000 requests/day free; upgrade plan if exceeded |
| iOS major update | Test Scan AVS camera capture + profile photo upload on iPhone |
| Android major update | Test Scan AVS camera capture + profile photo upload on Android |
| New Supabase project created | Re-run all SQL files, re-create avatars bucket (Section 4) |
| New mobile image format needs support | Add MIME type to `PASSTHROUGH_TYPES` in `scan.tsx` and `accept` attribute in `Dropzone.tsx` — only needed for formats Gemini supports natively as inline data |
| Role descriptions not showing in invite form | Check `ROLE_DESCRIPTION` constant in `src/routes/settings.tsx` — keyed by `admin`, `collaborator`, `viewer` |
| Member role changes not persisting | Verify `members: admin can update` RLS policy exists (Section 5) |
| Member names/avatars showing as blank | Verify `profiles: read circle peers` RLS policy exists (Section 5) |
| Role change not reflecting without refresh | Verify `care_circle_members` is in realtime publication (Section 5) |
| Realtime sync stops working | Re-run Section 7 realtime configuration SQL |
| A route shows an error fallback instead of crashing | Expected behaviour — `AppErrorBoundary` caught a render crash. Check the browser console for the error message logged by the boundary. Fix the underlying component issue and redeploy. |
| Error boundary fallback appears on every page load | A persistent render crash — likely a bad data shape from Supabase. Check the console error, inspect the relevant hook/query, and verify the data contract matches `database.types.ts`. |
| Tab transitions feel jaggy / brief loading state visible | Likely a new data hook isn't reporting to the route-readiness store, or a new route isn't wired into prefetch. See **Section 11 — Performance Patterns**. |

---

## 10. Rollback / Savepoint Strategy

CareSync's deployment pipeline is single-environment (no staging tier), so any bold experiment ships directly to the live app. To keep that safe, create a Git savepoint **before** any non-trivial feature work or refactor.

### Creating a savepoint

```bash
git tag -a vX.Y-pre-<feature-name> -m "Savepoint before <feature description>"
git push origin vX.Y-pre-<feature-name>
```

**Example used in this project:**
```bash
git tag -a v1.5-pre-patient-profile -m "Savepoint before Care Recipient feature"
git push origin v1.5-pre-patient-profile
```

Tags are immutable references and live both locally and on GitHub — they remain available as restore points indefinitely. You can list all savepoints with `git tag -l "v*-pre-*"`.

### Rolling back to a savepoint

```bash
git reset --hard <tag-name>
git push origin main --force-with-lease
npm run build
npx wrangler deploy
```

This returns code, Git history, and the deployed app to exactly the saved state.

### Notes and caveats

- **`--force-with-lease` over `--force`**: refuses to push if someone else has pushed to `main` since you last fetched — protects against silently overwriting a collaborator's work
- **Code-only rollback**: this procedure rolls back the codebase only. It does NOT undo:
  - Supabase schema changes (run a reverse migration SQL if needed)
  - Storage bucket uploads (manually delete from Supabase Storage if needed)
  - Netlify dashboard environment-variable changes (manually revert in the dashboard)
- **Schema/code coherence**: if the rolled-back code is incompatible with the current Supabase schema (e.g., references a column that has since been dropped), the app will error. Always pair a code rollback with the corresponding schema reversal.

### When to create a savepoint

| Trigger | Why |
|---|---|
| Before adding a new feature touching multiple files | Easy escape hatch if the design doesn't pan out |
| Before a SQL migration | Lets you revert the code half while you write a reverse SQL migration |
| Before a major package update (e.g., React, Tanstack Router) | Library upgrades can break in subtle ways |
| Before refactoring a hot path (realtime hooks, auth flow) | These touch every page; failures are highly visible |
| Before a public demo or stakeholder review | Guarantees a known-good fallback if a last-minute change misfires |

---

## 11. Performance Patterns — Adding New Routes / Data Hooks

CareSync's tab transitions feel near-instant because of two load-bearing systems that work invisibly. If you add a new route or a new data hook without integrating with them, transitions will regress and nobody will know why. This section is the checklist.

### What's in place

| File | What it does |
|---|---|
| `src/lib/routeReadiness.ts` | Module-level singleton that tracks whether ANY data hook is currently loading. Data hooks report via `useReportLoading(isLoading)`; the router reads aggregate state via `useAnyHookLoading()`. |
| `src/lib/routePrefetch.ts` | 30-second in-memory cache + per-route prefetch functions + a dispatcher (`prefetchForRoute`). Hover handlers in `AppNav.tsx` call this with a 150ms intent delay to warm data before the user clicks. |
| `src/routes/__root.tsx` — `DeferredRouteContent` | Wraps `<Outlet />`. Resets a `revealed` flag on every route change and only sets it `true` once `useAnyHookLoading()` returns `false` (or 800ms safety timeout). The new route mounts at opacity 0 and fades in only when its data is ready. |

Together: tab clicks render the destination route instantly (cache hit) or wait silently behind the old view (deferred reveal) — never a flash of skeleton or partial content.

### Checklist — adding a new data hook

Whenever you create a hook that fetches Supabase data on mount (mirroring `useTasks`, `useBroadcasts`, etc.):

1. **Report loading state.** Add this one line at the top of the hook body:
   ```typescript
   import { useReportLoading } from "@/lib/routeReadiness";
   // ...
   useReportLoading(isLoading);
   ```
   Without this, the deferred-mount router won't know to wait for your hook, and the route will appear before your data is ready.

2. **Check the prefetch cache before fetching.** At the top of your `fetchX` function, after the `if (!careCircleId) return` guard:
   ```typescript
   const cached = getCached<MyType>(cacheKey.myThing(careCircleId));
   if (cached) {
     setData(cached);
     setIsLoading(false);
     return;
   }
   ```

3. **Warm the cache on successful fetch.** In the success branch after adapting your data:
   ```typescript
   setCached<MyType>(cacheKey.myThing(careCircleId), adapted);
   ```

4. **Don't set `isLoading(false)` in the `if (!careCircleId)` early-return.** Just `return`. Setting it false causes a brief empty-state flash before the real fetch runs.

### Checklist — adding a new route

1. **Decide whether the route warrants prefetch.** Heuristic: yes if the route runs at least one Supabase query and is reachable from the sidebar. No if it's a static page (e.g. confirmation screen) or doesn't fetch (e.g. Scan AVS is a camera-only page).

2. **If yes:**
   - Add a `prefetchXxx(careCircleId)` function in `src/lib/routePrefetch.ts` that runs the same Supabase query as the route's hook(s) and writes to the cache under the same key (`cacheKey.xxx(...)`).
   - Add a `case "/your-route"` branch to `prefetchForRoute(to, careCircleId)`.
   - Confirm the route's hook(s) read from the same cache key.
   - The SideNav already calls `prefetchForRoute` via `onMouseEnter` — no nav changes needed if you've added your route's `to` to the existing `NAV` array.

3. **If no:** Still safe — `prefetchForRoute` falls through to a no-op for routes you don't register, and the deferred-mount logic still applies.

### Cache TTL and consistency

- **TTL:** 30 seconds. After that, cache entries are evicted on next read and a fresh fetch runs. Long enough for typical tab-to-tab navigation, short enough that you don't see stale data.
- **Realtime updates do NOT invalidate the cache directly.** The hook still maintains its own state via realtime; if a user is on the page when data changes, they see it. When they navigate away and back within 30s, they see the cached (possibly slightly stale) snapshot, then realtime patches it on remount. This is acceptable for CareSync's data shapes; if a route ever holds critically-fresh data, manually invalidate via `setCached(key, null)` or shorten the TTL.

### Debugging

| Symptom | Likely cause |
|---|---|
| Loading skeleton briefly visible during tab switch | A data hook on the destination route doesn't call `useReportLoading`. Add it. |
| Tab feels noticeably slower than other tabs on hover-then-click | Route isn't registered in `prefetchForRoute`, or its hook doesn't check the cache. |
| Stale data shows after switching back to a recently-visited tab | Cache TTL too long for this hook's data — shorten in `routePrefetch.ts` or invalidate explicitly. |
| Whole app appears stuck on a blank page | The 800ms safety timeout in `DeferredRouteContent` should prevent this; if it persists, a hook is stuck in `isLoading: true` indefinitely. Check for an unresolved fetch in console. |

---

*Last updated: May 18, 2026 — CareSync v1.6 (additions: HEIC/HEIF/PDF scan support, VITE_AVS_DAILY_SCAN_LIMIT display variable, netlify.env bulk import tip, Netlify account updated to caresync-ericmiao3, Granite default theme for new users)*
