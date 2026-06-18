# Local Development Setup

---

## Quick-start checklist

| Step | Command | Once or every time? |
|---|---|---|
| GCloud login | `gcloud auth login` | Once |
| Set ADC | `gcloud auth application-default login` | Once (or when expired) |
| Set project | `gcloud config set project YOUR_PROJECT_ID` | Once |
| Start local Redis | `docker run -d --name redis -p 6379:6379 redis:7-alpine` | Every machine, or use `docker start redis` to resume |
| Copy & edit .env | `cd backend && cp .env.example .env` | Once per clone |
| Install deps | `npm install` (in both `backend/` and `frontend/`) | After cloning or `package.json` changes |
| Start backend | `cd backend && npm run dev` | Every dev session |
| Start frontend | `cd frontend && npm run dev` | Every dev session |

---

## The most common local mistake — NODE_ENV=production in .env

**Symptom:** Every API call times out. Console shows `[Memorystore] Reconnecting in Nms…` on repeat.

**Cause:** `NODE_ENV=production` tells the app to connect to the GCP Memorystore private VPC IP
(`MEMORYSTORE_HOST`, e.g. `10.x.x.x`). That IP is only reachable from inside the GCP VPC
(Cloud Run + a Serverless VPC Access connector). From your laptop it is unreachable, so every
Redis call times out.

**Fix:** Open `backend/.env` and change (or remove) the line:
```
NODE_ENV=development    # ← correct for local dev
# NODE_ENV=production   # ← only set by the Dockerfile for Cloud Run
```

The Dockerfile already sets `NODE_ENV=production` automatically for every Cloud Run deployment.
You never need to set it yourself.

---

## Redis — local Docker container

The app works fine without Redis (all Redis calls are wrapped in `safeRedis` and fail open),
but you'll lose consent caching, session caching, and the realtime cache-demo panel.

Start a local Redis with Docker (one command, takes ~2 seconds):

```bash
docker run -d --name redis -p 6379:6379 redis:7-alpine
```

If the container already exists from a previous session:

```bash
docker start redis
```

Verify it's running:

```bash
docker ps --filter name=redis
redis-cli ping          # → PONG
```

The `backend/.env` already points `MEMORYSTORE_HOST_LOCAL=127.0.0.1` and
`MEMORYSTORE_PORT_LOCAL=6379` at this container. No further configuration needed.

---

## How environment routing works

```
NODE_ENV=development (local)
   └─ MEMORYSTORE_HOST_LOCAL  (default: 127.0.0.1)
   └─ MEMORYSTORE_PORT_LOCAL  (default: 6379)
   → Docker Redis on your machine

NODE_ENV=production (Cloud Run)
   └─ MEMORYSTORE_HOST        (your GCP private IP, e.g. 10.52.161.3)
   └─ MEMORYSTORE_PORT        (default: 6379)
   → GCP Memorystore inside the VPC
```

The Dockerfile sets `NODE_ENV=production` automatically — you never need to touch it for deploys.

---

## Application Default Credentials (ADC)

This project uses ADC — no service account JSON key file is required.

| Environment | Credential source | What you do |
|---|---|---|
| Local dev | `~/.config/gcloud/application_default_credentials.json` | `gcloud auth application-default login` once |
| Cloud Run | GCP metadata server (attached service account) | Nothing — automatic |

```bash
# One-time setup (local)
gcloud auth login
gcloud config set project YOUR_PROJECT_ID
gcloud auth application-default login
```

---

## AlloyDB — local access

AlloyDB is private-IP only. From your laptop you need one of:

- **AlloyDB Auth Proxy** (recommended):
  ```bash
  ./alloydb-auth-proxy /projects/PROJECT/locations/REGION/clusters/CLUSTER/instances/INSTANCE
  ```
  Then set `ALLOYDB_HOST=127.0.0.1` in your `.env`.

- **Cloud Shell or a VM** in the same VPC.

---

## Troubleshooting

**`[Memorystore] ⚠ Could not connect at startup`**
→ Redis container isn't running. Run `docker start redis` or the `docker run` command above.

**`Could not load the default credentials`**
→ Run `gcloud auth application-default login`.

**`Permission denied` on Firestore/Datastore**
→ Your account needs `roles/datastore.user` and `roles/firebase.admin` on the project.

**AlloyDB connection refused**
→ Start the AlloyDB Auth Proxy (see above).

**Benchmark shows `memorystore: { unavailable: true }`**
→ Redis isn't running locally. Start the Docker container — the rest of the benchmark still runs.
