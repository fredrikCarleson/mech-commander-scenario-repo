# Community publishing — operator setup

This is the work I cannot do from the repositories: Google Cloud, the Netlify dashboard, and local secret files. Do these steps, then tell me when you are done using the **report back** section at the end.

Do **not** paste secrets, session tokens, Netlify tokens, or Google client secrets into chat, tickets, or git.

Do **not** run production Blob migration yet. Do **not** remove `ADMIN_EMAILS` yet. Do **not** add `ADMIN_API_KEY`. Do **not** change Cloudflare.

Site: **meridian-strike-wiki** (`https://meridian-strike-wiki.netlify.app`)

---

## 0. Rules

- Public Desktop/Web **client IDs** are allowed in Netlify, game `.env.local`, and chat.
- Google may also show a Desktop **client secret**. Ignore it. Never store it in Netlify, Vite, Electron, or `.env`.
- `SESSION_SIGNING_SECRET` and `NETLIFY_AUTH_TOKEN` stay on your machine / Netlify UI only.
- `ADMIN_GOOGLE_SUBS` is a sensitive identifier. You may paste the `sub` value to me if you want it checked; do not paste the Google ID token or session JWT.
- After you add or change Netlify variables, trigger a new production deploy so Functions pick them up.

---

## 1. Google Cloud Console

Open [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services.

### 1.1 Consent screen

1. Open **OAuth consent screen**.
2. Confirm the app name, support email, and privacy-policy link are set for production use.
3. Scopes required: `openid` and `email` (email is often shown as `.../auth/userinfo.email`).
4. If the app is **External** and still in **Testing**, add your Google account under **Test users**. Otherwise only test users can sign in.
5. Do not copy any client secret from this page.

### 1.2 Keep the existing Web client (wiki admin)

This already drives `VITE_GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_ID` on Netlify.

1. Open **Credentials** and find the existing **Web application** OAuth client.
2. Copy its **Client ID** only. It ends in `.apps.googleusercontent.com`.
3. Under **Authorized JavaScript origins**, include at least:
   - `http://localhost:8888`
   - `http://localhost:5173`
   - `https://meridian-strike-wiki.netlify.app`
4. Keep any existing authorized redirect URIs that already work for the wiki `/admin` button. Add the same three origins as redirect URIs if Google requires them.
5. Do **not** replace this Web client with the Desktop client.

### 1.3 Create or verify the Desktop client (game)

1. **Create credentials** → **OAuth client ID** → application type **Desktop app**.
2. Name it something like `Meridian Strike Desktop`.
3. Copy the **Client ID** only (ends in `.apps.googleusercontent.com`).
4. Google may display a client secret for Desktop apps. **Do not use it.** The shipped game uses PKCE and a loopback callback (`http://127.0.0.1` on a random port).
5. You do not need to register a fixed redirect URI for that random port.

Keep both IDs in a local note, not in git:

```text
WEB_CLIENT_ID=.....apps.googleusercontent.com
DESKTOP_CLIENT_ID=.....apps.googleusercontent.com
```

---

## 2. Netlify dashboard — environment variables

Open the **meridian-strike-wiki** site → **Project configuration** → **Environment variables**.

Add each variable with the **scopes** listed. If a variable already exists with the same value, keep it. If a variable exists with a wrong value, fix it rather than duplicating it.

Netlify `netlify.toml` already declares the non-secret identity values, but production Functions are currently failing closed. **Set the identity values in the UI as well**, then redeploy.

### 2.1 Keep these (already present)

| Variable | Scope | Action |
| --- | --- | --- |
| `VITE_GOOGLE_CLIENT_ID` | Production, Deploy Previews, Branch deploys | Keep. Must be the **Web** client ID from step 1.2. |
| `GOOGLE_CLIENT_ID` | Same | Keep during migration. Same Web client ID. |
| `ADMIN_EMAILS` | Production | Keep until the later rollback window. Do not delete now. |

Confirm **`ADMIN_API_KEY` is absent**. If it exists, leave it unused and tell me. Do not add it.

### 2.2 Production identity (fixes the live API 500)

Scope: **Production** only.

| Variable | Exact value |
| --- | --- |
| `COMMUNITY_ENVIRONMENT` | `production` |
| `COMMUNITY_API_ORIGIN` | `https://meridian-strike-wiki.netlify.app/api/v1` |
| `SCENARIO_BLOB_STORE` | `mech-scenarios` |
| `SESSION_SIGNING_SECRET_ID` | `production-v1` |
| `COMMUNITY_MUTATION_MODE` | `authenticated` |
| `COMMUNITY_CORS_ORIGINS` | `https://meridian-strike-wiki.netlify.app,http://127.0.0.1:42647` |

Use those strings exactly. Do not point production at `mech-scenarios-candidate-v1`.

### 2.3 Candidate / preview identity

Scope: **Deploy Previews** and **Branch deploys** (not Production).

| Variable | Exact value |
| --- | --- |
| `COMMUNITY_ENVIRONMENT` | `staging` |
| `COMMUNITY_API_ORIGIN` | `https://candidate--meridian-strike-wiki.netlify.app/api/v1` |
| `SCENARIO_BLOB_STORE` | `mech-scenarios-candidate-v1` |
| `SESSION_SIGNING_SECRET_ID` | `candidate-v1` |
| `COMMUNITY_MUTATION_MODE` | `authenticated` |
| `COMMUNITY_CORS_ORIGINS` | `http://127.0.0.1:42647,http://127.0.0.1:42648` |

`COMMUNITY_API_ORIGIN` is an identity check, not the browser URL of a random deploy preview. Leave it as the matrix value even if a preview is served from `deploy-preview-N--meridian-strike-wiki.netlify.app`.

### 2.4 Google audiences (public, not secret)

Set on **Production**, **Deploy Previews**, and **Branch deploys**. Same values are acceptable for this release if you only created one Web client and one Desktop client.

| Variable | Value |
| --- | --- |
| `GOOGLE_WEB_CLIENT_IDS` | Web client ID from step 1.2 |
| `GOOGLE_DESKTOP_CLIENT_IDS` | Desktop client ID from step 1.3 |
| `GOOGLE_CLIENT_IDS` | `WEB_CLIENT_ID,DESKTOP_CLIENT_ID` (both, comma-separated, no spaces needed) |

Staging and production **require** both `GOOGLE_WEB_CLIENT_IDS` and `GOOGLE_DESKTOP_CLIENT_IDS`. Sign-in returns 503 if either list is empty.

### 2.5 Session secret (secret)

Generate two **different** secrets, each at least 32 characters.

In PowerShell, from any folder:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Run it twice. Do not commit the output. Do not paste it into chat.

| Variable | Production | Deploy Previews + Branch deploys |
| --- | --- | --- |
| `SESSION_SIGNING_SECRET` | first generated value | second generated value |

Rotating this later signs every creator/admin out.

### 2.6 Admin subjects (after you can sign in)

Leave `ADMIN_GOOGLE_SUBS` empty until step 5. Admin routes stay forbidden until it is set, which is expected.

---

## 3. Redeploy and record the previous deploy ID

1. In Netlify **Deploys**, copy the deploy ID of the last deploy that you still consider known-good (or the previous successful production deploy). Keep it in a private note.
2. Trigger **Deploy site** (clear cache if offered) so production Functions load the new variables.
3. After it is live, open:
   - `https://meridian-strike-wiki.netlify.app/api/v1/scenarios`
   - `https://meridian-strike-wiki.netlify.app/api/v1/campaigns`
4. Scenarios should return JSON with `items` (not HTML, not `Internal server error`). Campaigns may be `{ "items": [], "total": 0 }` if none are published yet.

If scenarios still 500, copy the **function log error message** (not env values) and send that.

---

## 4. Local files I cannot write for you

These files are gitignored. Create them on your machine only.

### 4.1 Community repo — `C:\VSCode\mech-commander-scenario-repo\.env`

For `npm run dev` only. Start from `.env.example` and fill:

```env
GOOGLE_WEB_CLIENT_IDS=<web client id>
GOOGLE_DESKTOP_CLIENT_IDS=<desktop client id>
GOOGLE_CLIENT_ID=<web client id>
GOOGLE_CLIENT_IDS=<web client id>,<desktop client id>
VITE_GOOGLE_CLIENT_ID=<web client id>
ADMIN_GOOGLE_SUBS=
SESSION_SIGNING_SECRET=<a third local-only secret, not the production one>
COMMUNITY_ENVIRONMENT=development
COMMUNITY_API_ORIGIN=http://localhost:8888/api/v1
SESSION_SIGNING_SECRET_ID=development-v1
COMMUNITY_MUTATION_MODE=authenticated
COMMUNITY_CORS_ORIGINS=http://localhost:8888,http://localhost:5173,http://127.0.0.1:42647
SCENARIO_BLOB_STORE=mech-scenarios-development-v1
```

Use a **different** `SESSION_SIGNING_SECRET` than production or candidate.

### 4.2 Game repo — `C:\VSCode\mech-command\.env.local`

```env
COMMUNITY_GOOGLE_OAUTH_CLIENT_ID=<desktop client id>
```

Optional, only if you want the game UI to talk to local Netlify instead of production:

```env
VITE_SCENARIO_REPO_API_BASE=http://localhost:8888/api/v1
```

Do **not** add:

- `COMMUNITY_GOOGLE_OAUTH_CLIENT_SECRET`
- `GOOGLE_CLIENT_SECRET`
- `SESSION_SIGNING_SECRET`
- `NETLIFY_AUTH_TOKEN`
- `VITE_DEV_MOCK_COMMUNITY_CREATOR_EMAIL` for any packaged or production build

---

## 5. Get your Google `sub` and set `ADMIN_GOOGLE_SUBS`

Admin authorization is the immutable Google subject, not email.

1. After production env + deploy, open `https://meridian-strike-wiki.netlify.app/admin`.
2. Sign in with the Web Google button.
3. In the browser, open DevTools → Network (or Application). Find the Google credential / JWT. Decode the payload (jwt.io is fine locally).
4. Copy the `sub` string only (digits, looks like `123456789012345678901`).
5. In Netlify, set `ADMIN_GOOGLE_SUBS` to that value on **Production**, **Deploy Previews**, and **Branch deploys**.
6. Redeploy production.
7. Sign in on `/admin` again. You should see the review queue, not a 403.

You can also paste `sub` into the local community `.env` `ADMIN_GOOGLE_SUBS` for `netlify dev`.

If `/admin` still says Google is not configured, `VITE_GOOGLE_CLIENT_ID` was not present at **build** time. Keep the variable and redeploy.

---

## 6. Do not do yet (I will ask after you report back)

- Production Blob export (`npm run inventory:export`) — needs `NETLIFY_AUTH_TOKEN` and `NETLIFY_SITE_ID` in your shell, never in git. Wait until the API reads succeed.
- `npm run migration:dry-run` against a real production snapshot.
- Applying migration to production Blobs.
- Removing `ADMIN_EMAILS`.
- Revoking a historical Desktop client secret (only after secretless packaged sign-in works).
- Steam packaging / private branch.
- Changing Cloudflare Workers, D1, or R2.

When we get to export, you will run this in PowerShell **after** setting the two values in that terminal session only:

```powershell
$env:NETLIFY_AUTH_TOKEN = "<personal access token with Blob read>"
$env:NETLIFY_SITE_ID = "<meridian-strike-wiki site ID from Site settings>"
npm run inventory:export -- --store mech-scenarios --environment production --output D:\secure-backups\community-before-migration.json
```

Create `D:\secure-backups` first if needed. The output path must not already exist and must stay **outside** both git repos.

---

## 7. Report back when done

Send me only this:

1. Web client ID (public).
2. Desktop client ID (public).
3. Confirm consent screen scopes include `openid` and `email`, and whether the app is Testing or Published.
4. Confirm Netlify production identity variables match section 2.2.
5. Confirm `GOOGLE_WEB_CLIENT_IDS` and `GOOGLE_DESKTOP_CLIENT_IDS` are set on production and previews.
6. Confirm two different `SESSION_SIGNING_SECRET` values exist (do not paste them).
7. What `GET /api/v1/scenarios` returns now (status + whether you see published items).
8. What `GET /api/v1/campaigns` returns now.
9. Whether `/admin` Google sign-in works, and whether `ADMIN_GOOGLE_SUBS` is set.
10. Confirm `C:\VSCode\mech-command\.env.local` contains `COMMUNITY_GOOGLE_OAUTH_CLIENT_ID` and no client secret.
11. The last known-good Netlify deploy ID, if you recorded it.
12. Confirm `ADMIN_API_KEY` is absent (or tell me if it was already there).

I will then continue from the plan: verify the live API, commit the game branch, and walk you through the read-only Blob export.
