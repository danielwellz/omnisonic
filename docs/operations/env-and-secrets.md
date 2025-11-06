# Environment Variables & Secrets

This guide summarizes the key environment variables and GitHub secrets required across Omnisonic environments.

## Global / CI Secrets
| Secret | Purpose |
| --- | --- |
| `NEXTAUTH_SECRET` | Session signing secret for NextAuth (CI/E2E may use a dummy value). |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | OAuth credentials for GitHub login. Optional providers (Google, Discord) follow the same naming pattern. |
| `DATABASE_URL` | Postgres connection string (used by migrations/tests). |
| `REDIS_URL` | Redis connection for realtime presence and queues. |
| `CLICKHOUSE_HOST` | Base URL for ClickHouse HTTP interface. |

> GitHub Actions: store environment-specific secrets using the names listed below. CI falls back to dummy values for optional providers and credentials.

## Staging Environment
| Secret | Notes |
| --- | --- |
| `DATABASE_URL_STAGING` | Points to staging Postgres primary (used for deploy workflow migrations). |
| `REDIS_URL_STAGING` | Redis instance for staging realtime/queues. |
| `CLICKHOUSE_HOST_STAGING` | ClickHouse HTTP endpoint for staging analytics. |
| `STORAGE_*` | Storage credentials (S3/MinIO) for uploads (see Chunk 3). |

## Production Environment
| Secret | Notes |
| --- | --- |
| `DATABASE_URL_PROD` | Production Postgres primary. |
| `DATABASE_READ_URL_PROD` | (Optional) Postgres read replica. |
| `REDIS_URL_PROD` | Production Redis endpoint. |
| `CLICKHOUSE_HOST_PROD` | Production ClickHouse endpoint. |
| `STORAGE_*` | Production storage credentials (S3/MinIO). |
| `SMTP_*` | Email credentials when alerts/notifications are enabled. |

## Local Development
Create `.env.local` files (per app/service) using the sample below:

```env
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=dev-secret
AUTH_ENABLE_CREDENTIALS=true
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres
REDIS_URL=redis://localhost:6379
CLICKHOUSE_HOST=http://localhost:8123
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
STORAGE_TYPE=local
S3_BUCKET_NAME=omnisonic-dev
MINIO_ENDPOINT=http://localhost:9000
MINIO_BUCKET_NAME=omnisonic-dev
MINIO_ACCESS_KEY=omnisonic
MINIO_SECRET_KEY=omnisonic123
```

## Storage Variables
| Variable | Description |
| --- | --- |
| `STORAGE_TYPE` | `local` (default), `minio`, or `s3`. |
| `S3_BUCKET_NAME` / `MINIO_BUCKET_NAME` | Target bucket for uploads. |
| `S3_REGION` | AWS region (S3 only). |
| `MINIO_ENDPOINT` | MinIO HTTP endpoint (e.g., `http://localhost:9000`). |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | Credentials for S3 (or MinIO if re-used). |
| `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY` | Dedicated MinIO credentials. |
| `STORAGE_CDN_URL` | Optional CDN/base URL for downloads. |
| `STORAGE_LOCAL_DIR` | Local filesystem path when `STORAGE_TYPE=local`. |

## Management Tips
- Rotate secrets regularly, especially OAuth and storage keys.
- Use GitHub Environments (staging, production) to require approval before deploy workflows run.
- Keep non-sensitive defaults in `.env.example`; never commit actual secrets. 
- Update this document when new services or providers introduce required configuration.
