# One Estate Coffee — Roast & Allocation Management Platform

Purpose-built web app for a specialty coffee roaster to manage green bean inventory, roast sessions, and allocation-based sales.

## Stack

| Layer     | Technology                          |
|-----------|-------------------------------------|
| Frontend  | React 18 + Vite + TailwindCSS       |
| Backend   | Node.js + Express                   |
| Database  | PostgreSQL (≥ 15)                   |
| Auth      | JWT (access 15 min) + refresh tokens (7 days) |
| Hosting   | AWS/GCP **Singapore region** (ap-southeast-1 / asia-southeast1) |

## Project structure

```
coffee_new/
├── client/                 # React frontend (Vite)
│   ├── src/
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   └── index.css
│   ├── index.html
│   ├── vite.config.js      # proxies /api → localhost:3001
│   ├── tailwind.config.js
│   └── package.json
├── server/                 # Express API
│   ├── src/
│   │   ├── config/db.js    # pg pool
│   │   ├── middleware/auth.js
│   │   ├── routes/auth.js  # all 5 auth endpoints
│   │   └── index.js
│   └── package.json
├── db/
│   ├── migrate.js          # migration runner
│   ├── package.json
│   └── migrations/
│       ├── 001_extensions_and_enums.sql
│       ├── 002_tenants.sql
│       ├── 003_users.sql
│       ├── 004_refresh_tokens.sql
│       ├── 005_lots.sql
│       ├── 006_lot_movements.sql
│       ├── 007_allocations.sql
│       ├── 008_allocation_state_log.sql
│       └── 009_roast_sessions.sql
├── .env.example
├── .gitignore
└── package.json            # npm workspaces root
```

## Local setup

### 1. Prerequisites

- Node.js ≥ 20
- PostgreSQL ≥ 15 running locally (or a remote instance)

### 2. Environment

```bash
cp .env.example .env
# Fill in DATABASE_URL and JWT_SECRET at minimum
```

Generate a secure JWT secret:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### 3. Install dependencies

```bash
npm install          # installs all workspaces
```

### 4. Create database

```bash
createdb one_estate_coffee   # or via psql
```

### 5. Run migrations

```bash
npm run migrate
```

### 6. Start development servers

```bash
# Terminal 1
npm run dev:server   # Express on :3001

# Terminal 2
npm run dev:client   # Vite on :5173
```

## Auth API

| Method | Endpoint              | Auth required | Description                          |
|--------|-----------------------|---------------|--------------------------------------|
| POST   | /api/auth/register    | No            | Create tenant + admin user           |
| POST   | /api/auth/login       | No            | Returns access_token + refresh_token |
| POST   | /api/auth/refresh     | No            | Exchange refresh token for new access |
| POST   | /api/auth/logout      | No            | Revoke refresh token                 |
| GET    | /api/auth/me          | Bearer token  | Current user info                    |

### Register body
```json
{
  "name": "Jane Doe",
  "email": "jane@example.com",
  "password": "atleast8chars",
  "tenant_name": "One Estate Coffee",
  "tenant_slug": "one-estate"
}
```

## Global rules (enforced throughout)

- All weights are stored as **integers (grams)**. No floats.
- All dates are stored as **UTC timestamptz**.
- **Soft delete only** — `deleted_at` field; all queries filter `WHERE deleted_at IS NULL`.
- Every query is **tenant-scoped** via `tenant_id`.
- `allocation_codes` are never reused — backed by a permanent global PostgreSQL sequence.
- `allocation_code` format: `{process_initial}-{seq:02d}` (e.g. W-01, H-12, N-04, A-07).

## Roles

| Role    | Capabilities                              |
|---------|-------------------------------------------|
| admin   | Full access including user management     |
| roaster | Manage roast sessions, view allocations   |
| viewer  | Read-only access                          |
