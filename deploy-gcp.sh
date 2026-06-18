

set -e

# config
export PROJECT_ID="${PROJECT_ID:-your-gcp-project-id}"
export REGION="europe-west3"
export ALLOYDB_CLUSTER="gdpr-cluster"
export ALLOYDB_INSTANCE="gdpr-primary"
export REDIS_INSTANCE="gdpr-cache"
export SA_NAME="gdpr-tracker-sa"
export BACKEND_SERVICE="gdpr-tracker-backend"
export FRONTEND_SERVICE="gdpr-tracker-frontend"
export AR_REPO="gdpr-tracker"

echo "GDPR Tracker - GCP Deployment"
echo "Project: $PROJECT_ID | Region: $REGION"
echo "Auth: Application Default Credentials (keyless)"
echo ""

# 1: configure project
echo "[1/9] Configuring GCP project..."
gcloud config set project $PROJECT_ID

# 2: enable required APIs
echo ""
echo "[2/9] Enabling GCP APIs..."
gcloud services enable \
  alloydb.googleapis.com \
  firestore.googleapis.com \
  redis.googleapis.com \
  datastore.googleapis.com \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  iam.googleapis.com \
  cloudresourcemanager.googleapis.com \
  firebase.googleapis.com \
  --quiet

# 3: AlloyDB cluster and primary instance
echo ""
echo "[3/9] Creating AlloyDB cluster (takes about 5-10 minutes)..."
gcloud alloydb clusters create $ALLOYDB_CLUSTER \
  --region=$REGION \
  --password="GdprTracker2024!" \
  --quiet || echo "Cluster already exists"

gcloud alloydb instances create $ALLOYDB_INSTANCE \
  --cluster=$ALLOYDB_CLUSTER \
  --region=$REGION \
  --instance-type=PRIMARY \
  --cpu-count=2 \
  --quiet || echo "Instance already exists"

echo "  AlloyDB cluster ready: $ALLOYDB_CLUSTER"

# 4: Memorystore (Redis)
echo ""
echo "[4/9] Creating Memorystore Redis instance..."
gcloud redis instances create $REDIS_INSTANCE \
  --size=1 \
  --region=$REGION \
  --tier=BASIC \
  --redis-version=redis_7_0 \
  --quiet || echo "Redis instance already exists"

echo "  Memorystore instance ready: $REDIS_INSTANCE"

# 5: Firestore in Native mode
echo ""
echo "[5/9] Creating Firestore database (Native mode)..."
gcloud firestore databases create \
  --location=$REGION \
  --quiet || echo "Firestore database already exists"

echo "  Firestore ready (Native mode)"

# 6: Datastore note
echo ""
echo "[6/9] Datastore uses the same GCP project as Firestore (AuditLog kind)"

# 7: service account, no key created
echo ""
echo "[7/9] Creating service account (keyless, will be attached to Cloud Run)..."
gcloud iam service-accounts create $SA_NAME \
  --display-name="GDPR Tracker Service Account" \
  --quiet || echo "Service account already exists"

SA_EMAIL="$SA_NAME@$PROJECT_ID.iam.gserviceaccount.com"

# assign roles, no key export, just IAM bindings
for ROLE in \
  roles/alloydb.client \
  roles/datastore.user \
  roles/firebase.admin \
  roles/redis.editor \
  roles/run.invoker; do
  gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:$SA_EMAIL" \
    --role="$ROLE" \
    --quiet
done

echo "  Service account ready: $SA_EMAIL"
echo "  No JSON key created, Cloud Run will use this SA via the metadata server"

# 8: connection details
echo ""
echo "[8/9] Fetching connection details..."

ALLOYDB_IP=$(gcloud alloydb instances describe $ALLOYDB_INSTANCE \
  --cluster=$ALLOYDB_CLUSTER \
  --region=$REGION \
  --format="get(ipAddress)" 2>/dev/null || echo "PENDING")

REDIS_IP=$(gcloud redis instances describe $REDIS_INSTANCE \
  --region=$REGION \
  --format="get(host)" 2>/dev/null || echo "PENDING")

echo "  AlloyDB IP: ${ALLOYDB_IP}"
echo "  Redis IP:   ${REDIS_IP}"

# 9: deploy to Cloud Run
echo ""
echo "[9/9] Deploying to Cloud Run..."

gcloud artifacts repositories create $AR_REPO \
  --repository-format=docker \
  --location=$REGION \
  --quiet || echo "Registry already exists"

# backend deploy - service account attached, not a key, ADC handles the rest
echo ""
echo "  Deploying backend..."
cd backend
gcloud run deploy $BACKEND_SERVICE \
  --source . \
  --region=$REGION \
  --platform=managed \
  --allow-unauthenticated \
  --service-account=$SA_EMAIL \
  --set-env-vars="GCP_PROJECT_ID=$PROJECT_ID,ALLOYDB_HOST=$ALLOYDB_IP,ALLOYDB_DB=gdprdb,ALLOYDB_USER=postgres,ALLOYDB_PASSWORD=GdprTracker2024!,MEMORYSTORE_HOST=$REDIS_IP,MEMORYSTORE_PORT=6379,NODE_ENV=production" \
  --min-instances=0 \
  --max-instances=10 \
  --memory=512Mi \
  --cpu=1 \
  --timeout=60 \
  --quiet
# no GOOGLE_APPLICATION_CREDENTIALS needed here, the attached
# --service-account gets picked up via the GCP metadata server

BACKEND_URL=$(gcloud run services describe $BACKEND_SERVICE --region=$REGION --format="get(status.url)")
echo "  Backend deployed: $BACKEND_URL"

cd ../frontend
echo "VITE_API_URL=$BACKEND_URL" > .env.production

echo ""
echo "  Deploying frontend..."
gcloud run deploy $FRONTEND_SERVICE \
  --source . \
  --region=$REGION \
  --platform=managed \
  --allow-unauthenticated \
  --set-env-vars="VITE_API_URL=$BACKEND_URL" \
  --min-instances=0 \
  --max-instances=5 \
  --memory=256Mi \
  --cpu=1 \
  --quiet

FRONTEND_URL=$(gcloud run services describe $FRONTEND_SERVICE --region=$REGION --format="get(status.url)")
echo "  Frontend deployed: $FRONTEND_URL"

cd ..

# summary
echo ""
echo "Deployment complete"
echo ""
echo "  Frontend : $FRONTEND_URL"
echo "  Backend  : $BACKEND_URL"
echo "  Health   : $BACKEND_URL/health"
echo ""
echo "  Auth: keyless ADC, no service account JSON key."
echo "  Cloud Run uses the attached SA via the metadata server."
echo ""
echo "  GDPR database architecture:"
echo "    AlloyDB      $ALLOYDB_IP  (personal data + Article 17)"
echo "    Firestore    europe-west3  (real-time consent)"
echo "    Memorystore  $REDIS_IP  (consent gate, <1ms)"
echo "    Datastore    europe-west3  (audit log, Article 30)"
echo ""
echo "  Next: add $FRONTEND_URL to Firebase authorized domains"
