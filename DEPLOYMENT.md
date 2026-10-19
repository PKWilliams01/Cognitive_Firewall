# Deployment

The app deploys as two pieces:

- **Frontend** (React) → **Vercel**
- **Backend** (Express + MongoDB) → **Render**, with the database on **MongoDB Atlas**

The repo already contains the config each platform needs:

- `frontend/vercel.json` — Vercel build settings for the React app
- `render.yaml` — Render Blueprint for the backend service
- `Backend/.env.example`, `frontend/.env.example` — the environment variables each side expects

Follow the steps in order; the pieces reference each other's URLs.

---

## 1. MongoDB Atlas (database)

1. Create a free cluster at <https://www.mongodb.com/cloud/atlas>.
2. Create a database user (username + password).
3. Network Access → allow `0.0.0.0/0` (Render's egress IPs are dynamic on the free plan).
4. Copy the connection string, e.g.
   `mongodb+srv://<user>:<pass>@<cluster>.mongodb.net/cognitive_firewall?retryWrites=true&w=majority`
   Keep this as your **`MONGO_URI`**.

## 2. Render (backend API)

1. Render Dashboard → **New → Blueprint** → connect this GitHub repo. Render reads `render.yaml` and creates the `cognitive-firewall-api` web service.
2. When prompted (or in the service's **Environment** tab after the first deploy), set:
   - `MONGO_URI` → the Atlas string from step 1
   - `CLIENT_URL` → leave blank for now; fill it in step 4
   - `JWT_SECRET` is generated automatically by Render.
3. Deploy. Note the service URL, e.g. `https://cognitive-firewall-api.onrender.com`. That is your **backend URL**.
   - Verify it: visiting the URL should return `Backend is running`.
   - Note: the free plan sleeps after inactivity, so the first request after idle takes ~30–50s.

## 3. Vercel (frontend)

1. Vercel → **Add New → Project** → import this repo.
2. **Leave Root Directory at the repository root** (the default). The root
   `vercel.json` handles the monorepo: it installs and builds inside
   `frontend/` and serves `frontend/build`. Do **not** set Root Directory to
   `frontend` — the root `vercel.json` does the directory switch itself.
3. Framework Preset: **Other** (the root `vercel.json` defines the build).
4. Add an Environment Variable (Key / Value — don't paste the URL into the Key box):
   - Key: `REACT_APP_API_URL`
   - Value: the backend URL from step 2 (e.g. `https://cognitive-firewall-api.onrender.com`)
5. Deploy. Note the frontend URL, e.g. `https://cognitive-firewall.vercel.app`.

## 4. Close the CORS loop

1. Back in **Render → cognitive-firewall-api → Environment**, set:
   - `CLIENT_URL` → the Vercel frontend URL from step 3
2. Save (Render redeploys). This lets the backend accept browser requests from the deployed frontend.

## 5. Google sign-in (optional)

"Continue with Google" stays visible but disabled until this is configured.

1. Google Cloud Console → **APIs & Services → OAuth consent screen**: choose
   **External**, fill in the app name and support email, and publish it (or
   add yourself as a test user while it's in Testing).
2. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type: **Web application**
   - **Authorised JavaScript origins**: add every URL the frontend is served
     from, e.g. `http://localhost:3000` and your Vercel production URL.
     (No redirect URIs are needed — sign-in uses Google's popup.)
3. Copy the **Client ID** (`…apps.googleusercontent.com`) and set it in both places:
   - Render → `GOOGLE_CLIENT_ID`
   - Vercel → `REACT_APP_GOOGLE_CLIENT_ID` (then redeploy so it's baked into the build)

The client ID is public by design; there is no client secret in this flow.
The backend verifies every Google ID token against `GOOGLE_CLIENT_ID` before
signing anyone in.

> Google only allows origins you list explicitly, so per-deployment Vercel
> preview URLs won't show a working Google button — test Google sign-in on the
> production URL (or localhost).

---

## Environment variable summary

| Variable                     | Where set | Value                                     |
|------------------------------|-----------|-------------------------------------------|
| `MONGO_URI`                  | Render    | Atlas connection string                   |
| `JWT_SECRET`                 | Render    | auto-generated                            |
| `CLIENT_URL`                 | Render    | the Vercel frontend origin                |
| `NODE_ENV`                   | Render    | `production` (from `render.yaml`)         |
| `GOOGLE_CLIENT_ID`           | Render    | Google OAuth client ID (optional)         |
| `REACT_APP_API_URL`          | Vercel    | the Render backend origin                 |
| `REACT_APP_GOOGLE_CLIENT_ID` | Vercel    | same Google OAuth client ID (optional)    |

## Redeploys

Both platforms redeploy automatically on push to `main`. The Vercel project
builds from the **repository root** using the root `vercel.json`; the Render
service also tracks the repo root and uses `render.yaml`.
