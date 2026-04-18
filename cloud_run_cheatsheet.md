# Cloud Run & Google Cloud CLI Cheatsheet

This repo deploys to Google Cloud Run as a single container built from the local `Dockerfile`.
`docker-compose.yml` is only for local orchestration of that same container and is not deployed directly to Cloud Run.

## Environment

- **Project ID:** `decent-vertex-438013-p6`
- **Default Region:** `europe-west4`
- **Artifact Registry Repo:** `cloud-run-source-deploy`
- **Suggested Service Name:** `scrum-poker`
- **App Port:** `3000`

**Active `gcloud` configuration (`default`):**
```ini
[core]
account = mafentakis@googlemail.com
project = decent-vertex-438013-p6

[run]
region = europe-west4
```

## Preflight

Run these from the repo root before deploying:

```bash
gcloud config list
gcloud run services list --region europe-west4
```

Expected for this repo:
- `gcloud` project is `decent-vertex-438013-p6`
- region is `europe-west4`
- the `Dockerfile` in this folder is the build source
- `server.js` listens on `process.env.PORT`, with `3000` as the local default

## How This Repo Maps to Cloud Run

- `docker-compose.yml` defines one service, `scrum-poker`, exposing `3000:3000`
- Cloud Run does not deploy Compose directly
- Cloud Run builds from the current folder and runs the resulting container
- The existing `Dockerfile` already builds the Angular app and starts the Node server

## Primary Deployment Flow

Deploy the current folder to Cloud Run using the local `Dockerfile`:

```bash
gcloud run deploy scrum-poker --source . --region europe-west4 --allow-unauthenticated --port 3000
```

Useful follow-up commands:

```bash
gcloud run services describe scrum-poker --region europe-west4
gcloud run services logs read scrum-poker --region europe-west4 --limit 50
gcloud beta run services logs tail scrum-poker --region europe-west4
gcloud run services delete scrum-poker --region europe-west4
```

## Manual Image Build And Deploy

If you want explicit image control instead of `--source .`:

**1. Authenticate local Docker:**
```bash
gcloud auth configure-docker europe-west4-docker.pkg.dev
```

**2. Build and tag the image:**
```bash
docker build -t europe-west4-docker.pkg.dev/decent-vertex-438013-p6/cloud-run-source-deploy/scrum-poker:latest .
```

**3. Push the image:**
```bash
docker push europe-west4-docker.pkg.dev/decent-vertex-438013-p6/cloud-run-source-deploy/scrum-poker:latest
```

**4. Deploy the image:**
```bash
gcloud run deploy scrum-poker --image europe-west4-docker.pkg.dev/decent-vertex-438013-p6/cloud-run-source-deploy/scrum-poker:latest --region europe-west4 --allow-unauthenticated --port 3000
```

## Runtime Notes

- The app exposes HTTP plus WebSockets on `/ws`
- Cloud Run supports WebSocket connections for this style of service
- Room state is stored in memory inside the Node process
- In-memory room state is ephemeral and not shared across multiple Cloud Run instances or revisions

## General `gcloud` Config

```bash
gcloud config list
gcloud config set project YOUR_PROJECT_ID
gcloud config set run/region europe-west4
```
