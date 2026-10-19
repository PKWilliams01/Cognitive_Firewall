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

---

## Environment variable summary

| Variable            | Where set        | Value                                            |
|---------------------|------------------|--------------------------------------------------|
| `MONGO_URI`         | Render           | Atlas connection string                          |
| `JWT_SECRET`        | Render           | auto-generated                                   |
| `CLIENT_URL`        | Render           | the Vercel frontend origin                       |
| `NODE_ENV`          | Render           | `production` (from `render.yaml`)                |
| `REACT_APP_API_URL` | Vercel           | the Render backend origin                        |

## Redeploys

Both platforms redeploy automatically on push to `main`. The Vercel project
builds from the **repository root** using the root `vercel.json`; the Render
service also tracks the repo root and uses `render.yaml`.
