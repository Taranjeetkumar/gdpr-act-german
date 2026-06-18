# GDPR Consent & Data Lineage Tracker

**Masters-level academic project** — Advanced Software Development using Google Cloud Databases

A production-quality privacy management platform built on **4 Google Cloud databases**, each with a distinct, justified GDPR compliance role. Lets users control what personal data is collected, stored, and processed — and exercise their GDPR rights including right to erasure (Article 17).

---

## Architecture — 4 GCP Databases

| Database | Role | GDPR Articles |
|---|---|---|
| **AlloyDB** | Primary relational store — personal data, cascade delete | Art. 17 (erasure), Art. 20 (portability) |
| **Firestore** | Real-time consent preferences — pushes to all sessions | Art. 6 (lawful basis), Art. 7 (consent) |
| **Memorystore** | Consent enforcement gate — Redis check <1ms every API call | Art. 6(1)(a), Art. 25 (privacy by default) |
| **Datastore** | Immutable audit log — Article 30 Records of Processing | Art. 30 (records), Art. 17(3) (exception) |

### Why these choices?

**AlloyDB over Cloud SQL**: PostgreSQL-compatible with ACID transactions — critical for atomic Article 17 erasure across multiple tables. The `ON DELETE CASCADE` foreign keys make right-to-erasure automatic and tamper-proof.

**Firestore over AlloyDB for consent**: Real-time listeners push consent revocation to every open browser tab simultaneously (~200ms latency). No polling needed. When a user revokes marketing consent on mobile, their desktop session blocks data access instantly.

**Memorystore over Firestore direct**: At 1000+ req/s, a Firestore read on every API call is cost-prohibitive (~$0.06 per 100k reads) and adds 50–200ms latency. Redis serves cached consent flags in <1ms from RAM. TTL of 5 minutes balances freshness vs performance.

**Datastore over AlloyDB for audit logs**: Append-only, schema-free, scales to billions of entries with no migration risk. Chronological queries via indexed timestamp. Critically: Datastore entries are never updated or deleted — enforcing the immutability of the Article 30 compliance record.

---

## Tech Stack

```
Backend:   Node.js 20 + Express.js (CommonJS)
Frontend:  React 18 + Vite + Tailwind CSS + Redux Toolkit
Auth:      Firebase Authentication (Google Sign-In)
Databases: AlloyDB · Firestore · Memorystore (Redis) · Datastore
Deploy:    Google Cloud Run (europe-west3 — Frankfurt, Germany)
```

---

## Project Structure

```
gdpr-tracker/
├── backend/
│   ├── src/
│   │   ├── server.js                  ← Express app entry point
│   │   ├── config/
│   │   │   ├── alloydb.js             ← pg Pool (PostgreSQL driver)
│   │   │   ├── firestore.js           ← @google-cloud/firestore
│   │   │   ├── memorystore.js         ← ioredis client
│   │   │   └── datastore.js           ← @google-cloud/datastore
│   │   ├── middleware/
│   │   │   ├── auth.js                ← Firebase JWT verification
│   │   │   ├── consentCheck.js        ← Redis consent gate (check before every data op)
│   │   │   └── auditLogger.js         ← Auto-logs all requests to Datastore
│   │   ├── routes/
│   │   │   ├── auth.js                ← POST /api/auth/register, GET /api/auth/me
│   │   │   ├── consent.js             ← GET/POST /api/consent/:userId
│   │   │   ├── personalData.js        ← CRUD /api/data/:userId
│   │   │   ├── requests.js            ← GDPR rights: erasure, portability
│   │   │   ├── audit.js               ← GET /api/audit/:userId
│   │   │   ├── admin.js               ← GET /api/admin/dashboard
│   │   │   ├── benchmark.js           ← Empirical latency/throughput comparison
│   │   │   └── realtime.js            ← Live push-vs-cache-vs-pull comparison (SSE)
│   │   └── services/
│   │       ├── alloydbService.js      ← All SQL queries incl. executeErasureRequest()
│   │       ├── firestoreService.js    ← Consent CRUD + history subcollection
│   │       ├── memorystoreService.js  ← Cache get/set/invalidate + rate limiting
│   │       ├── datastoreService.js    ← Audit log writes + chronological queries
│   │       └── benchmarkService.js    ← Latency/throughput probes across all 4 DBs
│   ├── scripts/
│   │   └── initSchema.js              ← Creates AlloyDB tables + seeds data
│   ├── .env.example
│   ├── package.json
│   └── Dockerfile
│
├── frontend/
│   ├── src/
│   │   ├── main.jsx                   ← React entry + Redux Provider
│   │   ├── App.jsx                    ← Router + ProtectedRoute
│   │   ├── store.js                   ← Redux Toolkit store (auth, consent, ui slices)
│   │   ├── firebase.js                ← Firebase config + Google provider
│   │   ├── api/client.js              ← Axios + Firebase JWT interceptor
│   │   ├── api/sse.js                 ← Authenticated SSE consumer (fetch + ReadableStream)
│   │   ├── contexts/AuthContext.jsx   ← Firebase Auth state + AlloyDB user sync
│   │   ├── pages/
│   │   │   ├── Login.jsx              ← Google Sign-In + architecture overview
│   │   │   ├── Dashboard.jsx          ← Stats from all 4 databases
│   │   │   ├── ConsentManager.jsx     ← Toggle consent preferences (Firestore + Redis)
│   │   │   ├── MyData.jsx             ← Personal data records from AlloyDB
│   │   │   ├── DataLineage.jsx        ← Audit trail charts (Datastore via recharts)
│   │   │   ├── Requests.jsx           ← Article 17 erasure + Article 20 export
│   │   │   ├── AdminDashboard.jsx     ← All 4 DB stats + consent rates chart
│   │   │   ├── BenchmarkDashboard.jsx ← Measured latency/throughput comparison
│   │   │   └── RealtimeComparison.jsx ← Live push vs. cache vs. pull comparison
│   │   └── components/
│   │       ├── Navbar.jsx             ← Navigation with DB badges
│   │       ├── ConsentToggle.jsx      ← Accessible consent switch
│   │       ├── AuditTable.jsx         ← Datastore log table
│   │       ├── DataCategoryCard.jsx   ← Expandable data category with sensitivity badge
│   │       ├── LineageChart.jsx       ← recharts activity + action breakdown charts
│   │       └── DeletionModal.jsx      ← Article 17 erasure flow (confirm → process → done)
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   └── tailwind.config.js
│
├── deploy-gcp.sh                      ← Full GCP deployment script
└── README.md
```

---

## Local Development Setup

### Prerequisites
- Node.js 20+
- Google Cloud account with a project
- Firebase project (same GCP project)
- `gcloud` CLI authenticated

### 1. Clone and install

```bash
git clone <your-repo>
cd gdpr-tracker

# Install backend
cd backend && npm install

# Install frontend
cd ../frontend && npm install
```

### 2. Firebase setup

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Create project (or use existing GCP project)
3. Enable **Authentication → Google Sign-In**
4. Get web app config (Project Settings → Your apps)

### 3. Configure environment

```bash
# Backend
cd backend
cp .env.example .env
# Fill in: GCP_PROJECT_ID, ALLOYDB_HOST, ALLOYDB_PASSWORD, MEMORYSTORE_HOST
# For local dev without AlloyDB: leave ALLOYDB_HOST empty — schema init will warn but not crash

# Frontend
cd ../frontend
cp .env.example .env
# Fill in all VITE_FIREBASE_* values from Firebase console
```

### 4. Run locally

```bash
# Terminal 1: Backend
cd backend
npm run dev
# → Backend on http://localhost:8080
# → AlloyDB schema auto-initialized on startup

# Terminal 2: Frontend
cd frontend
npm run dev
# → Frontend on http://localhost:5173
```

---

## GCP Deployment

### Quick deploy
```bash
export PROJECT_ID="your-gcp-project-id"
chmod +x deploy-gcp.sh
./deploy-gcp.sh
```

### Manual steps

```bash
export PROJECT_ID="your-project-id"
export REGION="europe-west3"

# 1. Enable APIs
gcloud services enable alloydb.googleapis.com firestore.googleapis.com \
  redis.googleapis.com datastore.googleapis.com run.googleapis.com

# 2. AlloyDB
gcloud alloydb clusters create gdpr-cluster --region=$REGION --password=YourPassword
gcloud alloydb instances create gdpr-primary --cluster=gdpr-cluster \
  --region=$REGION --instance-type=PRIMARY --cpu-count=2

# 3. Memorystore Redis
gcloud redis instances create gdpr-cache --size=1 --region=$REGION

# 4. Firestore (Native mode)
gcloud firestore databases create --location=$REGION

# 5. Service account
gcloud iam service-accounts create gdpr-tracker-sa
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:gdpr-tracker-sa@$PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/alloydb.client"
# (repeat for roles/datastore.user, roles/firebase.admin, roles/redis.editor)

# 6. Deploy backend
cd backend
gcloud run deploy gdpr-tracker-backend --source . --region=$REGION \
  --set-env-vars="GCP_PROJECT_ID=$PROJECT_ID,ALLOYDB_HOST=<alloydb-ip>,..."

# 7. Deploy frontend
cd ../frontend
npm run build
gcloud run deploy gdpr-tracker-frontend --source . --region=$REGION
```

---

## API Reference

### Auth
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/auth/register` | Create user in AlloyDB + init Firestore consents |
| `GET`  | `/api/auth/me` | Get current user from AlloyDB |

### Consent (Firestore + Memorystore)
| Method | Endpoint | Description |
|---|---|---|
| `GET`  | `/api/consent/:userId` | Get all consent preferences |
| `POST` | `/api/consent/:userId` | Update consent `{ purpose, granted }` |
| `GET`  | `/api/consent/:userId/history` | Full change history |

### Personal Data (AlloyDB)
| Method | Endpoint | Description |
|---|---|---|
| `GET`  | `/api/data/:userId` | Get all personal data records |
| `POST` | `/api/data/:userId` | Add data record (requires functional consent) |
| `GET`  | `/api/data/categories/all` | All data categories |

### GDPR Requests (AlloyDB + all DBs for erasure)
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/requests` | Submit erasure / portability request |
| `GET`  | `/api/requests/:userId` | Get all requests |
| `POST` | `/api/requests/:id/execute-erasure` | CASCADE delete: AlloyDB → Firestore → Memorystore |
| `GET`  | `/api/requests/:userId/export` | Article 20 JSON data export |

### Audit (Datastore)
| Method | Endpoint | Description |
|---|---|---|
| `GET`  | `/api/audit/:userId` | User audit trail (Article 30) |
| `GET`  | `/api/audit/:userId/deletions` | Erasure certificate |
| `GET`  | `/api/audit/admin/all` | All events (admin only) |

### Admin
| Method | Endpoint | Description |
|---|---|---|
| `GET`  | `/api/admin/dashboard` | Stats from all 4 databases |
| `PATCH`| `/api/admin/requests/:id` | Process pending GDPR request |

### Realtime Comparison (Firestore + Memorystore + AlloyDB)
| Method | Endpoint | Description |
|---|---|---|
| `GET`  | `/api/realtime/consent/:userId/stream` | SSE — pushes Firestore changes the instant they happen |
| `GET`  | `/api/realtime/consent/:userId/:purpose/cache` | Memorystore demo cache-aside read (adjustable TTL via `?ttl=`) |
| `GET`  | `/api/realtime/consent/:userId/:purpose/alloydb` | AlloyDB pull-only read of the mirrored consent fact |

---

## GDPR Articles Implemented

| Article | Description | Implementation |
|---|---|---|
| Art. 6 | Lawful basis for processing | Legal basis stored per data category in AlloyDB |
| Art. 7 | Conditions for consent | Withdrawal logged to Firestore + Datastore; effective <5min via Redis TTL |
| Art. 12 | Transparent communication | 30-day response window tracked in data_requests table |
| Art. 13 | Info at point of collection | Logged to Datastore on USER_REGISTERED |
| Art. 15 | Right of access | `GET /api/data/:userId` — complete personal data view |
| Art. 17 | Right to erasure | Cascade: AlloyDB → Firestore → Memorystore; Datastore preserved Art. 17(3)(b) |
| Art. 20 | Right to portability | JSON export from AlloyDB with all categories and processing purposes |
| Art. 25 | Privacy by default | Default consents = false; fail-closed on Redis errors |
| Art. 30 | Records of processing | Datastore AuditLog — immutable, never deleted |

---

## Database Architecture Deep Dive

### AlloyDB Schema

```sql
users              -- Firebase UID, email, created_at, deleted_at (soft delete)
data_categories    -- 7 types: Email, Name, IP, Location, Purchase, Browsing, Device
personal_data      -- FK → users (ON DELETE CASCADE), FK → data_categories
processing_purposes-- 6 purposes: marketing, analytics, personalization, 3rd-party, functional, security
data_requests      -- Erasure/portability/rectification/restriction requests
```

### Firestore Structure

```
consents/
  {userId}/
    consents: { marketing_emails: {granted, label, ...}, analytics: {...}, ... }
    lastUpdated: timestamp
    history/
      {changeId}: { purpose, oldValue, newValue, changedAt, action }
```

### Memorystore Key Pattern

```
consent:{userId}:{purpose}  → "granted" | "denied"  (TTL: 300s)
session:{userId}            → JSON user data          (TTL: 3600s)
deletion:{userId}           → "processing"|"completed" (TTL: 3600s)
ratelimit:{userId}:{action} → count                   (TTL: 3600s)
```

### Datastore Kinds

```
AuditLog:    userId, action, resourceType, resourceId, performedBy, ipAddress, timestamp, gdprArticle
DeletionLog: userId, system, recordCount, deletedAt, gdprArticle
```

---

## Live Real-Time Behavior Comparison

The architecture rationale above ("Firestore pushes consent revocation to every open browser tab")
is backed by an actual running demo, not just prose: **`/realtime`** in the app ("Live Compare" in
the nav).

One consent toggle is written to all three relevant stores in a single request
(`POST /api/consent/:userId` → Firestore, Memorystore, AlloyDB), so all three are equally
up to date the instant that request completes. The page then shows, side by side, how each
one actually lets a client find out:

| Database | Mechanism | Endpoint | Behavior you'll observe |
|---|---|---|---|
| **Firestore** | Push — admin SDK `onSnapshot` over Server-Sent Events | `GET /api/realtime/consent/:userId/stream` | Updates the instant the toggle is sent — no poll, no refresh |
| **Memorystore** | Cache-aside, adjustable demo TTL (5–20s; production uses 5 min) | `GET /api/realtime/consent/:userId/:purpose/cache` | Keeps the *old* value until its TTL expires, then reads through and catches up |
| **AlloyDB** | Pull-only — plain `SELECT` against a `consent_snapshot` mirror table | `GET /api/realtime/consent/:userId/:purpose/alloydb` | Already holds the new value the moment you toggle, but nothing pushes it to an open tab — you have to click Refresh |

`consent_snapshot` exists solely to make this comparison apples-to-apples: it holds the *exact
same fact* Firestore and Memorystore hold for a user's consent, written in the same request, so
the only variable across the three panels is the propagation model — not data freshness at the
source.

This complements `/benchmark` (which measures *speed* — latency and throughput) with a
demonstration of *consistency/propagation behavior*, the other half of a rigorous database
comparison.

---

## Article 17 Erasure Flow

When a user requests erasure, the `execute-erasure` endpoint cascades through all systems:

```
1. AlloyDB    → DELETE FROM personal_data WHERE user_id = $1
                UPDATE users SET email='deleted_...', deleted_at=NOW()
                (ON DELETE CASCADE handles data_requests automatically)

2. Firestore  → Delete consents/{userId} + all history subcollection docs

3. Memorystore→ DEL consent:{userId}:* + DEL session:{userId}

4. Datastore  → PRESERVE AuditLog + write DeletionLog entry
                (Article 17(3)(b): legal obligation exception — we MUST keep the proof)
```

All steps are logged to Datastore. If any step fails, the error is caught and the status is set to 'failed' in Memorystore for the frontend to poll.

---

## Presentation Notes (Academic Justification)

### Database Selection Rationale

**AlloyDB over standard Cloud SQL:**
> "AlloyDB's PostgreSQL compatibility means we use the standard `pg` driver with no vendor lock-in for application code. The columnar engine accelerates aggregate queries for compliance reports. Most critically, AlloyDB's ACID transaction support ensures the Article 17 cascade delete either fully completes or fully rolls back — partial erasure is legally and reputationally catastrophic."

**Firestore for consent (not AlloyDB):**
> "GDPR Article 7 requires consent withdrawal to be as easy as giving it, and changes must be effective 'immediately.' Firestore's real-time SDK pushes consent changes via WebSocket to every open browser tab in ~200ms. If we stored consent in AlloyDB, a revoked marketing consent would only take effect on the user's next login — potentially hours later — which violates the spirit of Article 7."

**Memorystore for enforcement (not Firestore direct):**
> "In a production system processing 10,000 requests/second, every consent check hitting Firestore would cost $36/hour in Firestore read charges alone, plus 50-200ms added to every response. Redis at <1ms and ~$0.001/hour for cached reads is orders of magnitude more efficient. We use a 5-minute TTL as a deliberate trade-off: consent revocations take effect within 5 minutes, not instantly — but this is clearly disclosed to users."

**Datastore for audit logs (not AlloyDB):**
> "The Article 30 audit log must be immutable — we must prove to the Datenschutzbehörde that no one has tampered with it. Datastore's NoSQL model makes it natural to implement as append-only: there are no UPDATE statements in the datastoreService.js file. It scales to billions of entries with no schema migrations, which is critical because audit logs cannot have planned downtime. AlloyDB audit tables would require schema migrations as requirements evolve."

---

## License

MIT — Academic use. Do not use in production without implementing encryption at rest for `personal_data.data_value`.
