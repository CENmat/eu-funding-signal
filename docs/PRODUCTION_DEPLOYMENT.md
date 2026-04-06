# Production Deployment

This repo already has a static demo live on Firebase Hosting. To convert it into a real backend-connected deployment, use the flow below.

## Target Shape

- Frontend: static Next.js export on Firebase Hosting
- Backend: FastAPI container on Cloud Run
- Database: managed PostgreSQL with `pgvector`
- Refresh: scheduled ETL jobs hitting public data sources and local cache

## Required Cloud Prerequisites

Before the full deployment can succeed, the GCP/Firebase project needs:

- valid Firebase or GCP CLI credentials
- billing enabled on the project
- a PostgreSQL database reachable by the backend

## One-Command Flow

When those prerequisites exist, run:

```bash
FIREBASE_PROJECT_ID=your-project-id \
DATABASE_URL='postgresql+psycopg://user:pass@host:5432/eu_funding_signal' \
node scripts/deploy-full-stack.mjs
```

This script:

1. deploys the FastAPI backend to Cloud Run
2. reads the live Cloud Run URL
3. rebuilds the frontend in backend mode
4. redeploys the frontend to Firebase Hosting

## Current Blockers Seen In This Session

On April 6, 2026, this machine could:

- create a Firebase project
- deploy Firebase Hosting

But it could not complete production backend deployment because:

- Firebase admin credentials were reported as needing reauthentication for some project-management operations
- Docker is not installed locally, so local compose validation cannot run here
- no managed PostgreSQL instance is provisioned yet for the cloud deployment

## Recommended Next Infra Move

Use a managed PostgreSQL service, then run migrations:

```bash
cd backend
. .venv/bin/activate
alembic upgrade head
```

Then redeploy the frontend against the backend URL.

