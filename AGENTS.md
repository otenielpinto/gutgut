# AGENTS.md

Instructions for AI agents working in this repository.

## Project Overview

Node.js backend integration service for Tiny ERP API. Syncs stock, orders, and products between internal systems (Firebird) and Tiny/NuvemShop platforms.

## Working Directory

**All npm commands run from `src/`, NOT the repo root.**

```bash
cd src && npm start   # correct
npm start             # incorrect - package.json is in src/
```

## Commands

```bash
# Start dev server (with nodemon)
cd src && npm start

# Install dependencies
cd src && npm install
```

No test suite configured. Verification is manual via health endpoint and logs.

## Stack

- Node.js 22.x, npm 10.x (engines enforced)
- Express + ESM modules (`type: "module"`)
- MongoDB (integration logs, multi-tenant data)
- Firebird (legacy ERP via `node-firebird`)
- node-schedule (cron jobs in `agenda.js`)
- Zod (validation)

## Architecture

```
src/
├── server.js          # Entry point: starts app + agenda jobs
├── app.js             # Express app + routes
├── agenda.js          # Scheduled jobs (runs automatically on start)
├── controller/        # Request handlers
├── services/          # Business logic + external API calls
├── repository/        # Data access (MongoDB via baseRepository)
├── infra/
│   ├── mongoClient.js # MongoDB connection
│   └── fb5.js         # Firebird queries (legacy ERP)
├── api/tinyApi.js     # Tiny ERP API wrapper
├── routes/            # Express routes
└── types/             # Constants (marketplaceTypes)
```

Pattern: Controller → Service → Repository. Repositories extend `baseRepository.js` for MongoDB ops.

## Environment Setup

Copy `.env.example` to `.env` before running. Required variables:

```
NODE_PORT=3512
MONGO_CONNECTION=<mongodb uri>
MONGO_DATABASE=<db name>
FIREBIRD_HOST/PORT/DATABASE/USER/PWD=<firebird config>
CRON_JOB_TIME=<minutes between job runs>
PEDIDO_NUMERO_DIAS_PROCESSAR=<days to process orders>
```

Server will fail without valid MongoDB and Firebird connections.

## Key Behaviors

1. **Scheduled jobs auto-start**: `agenda.js` runs on server start. Two jobs:
   - Main sync job (interval: `CRON_JOB_TIME` minutes)
   - Order processing job (every 6 minutes)

2. **Multi-tenant**: All MongoDB repositories use `id_tenant` for data isolation. Tenant context comes from `mpkIntegracaoController`.

3. **Dual database**: MongoDB for integration state/logs; Firebird for legacy ERP data. Don't mix patterns—MongoDB repos extend `Repository`, Firebird uses `fb5` helpers.

4. **ESM modules**: All files use `import/export`. No `require()`.

5. **Auth middleware**: Routes under `/anuncio/` require `client_id` and `client_secret` headers. `/authorization/` and `/ecommerce/` are public.

## Endpoints

```
GET  /health                # Health check (no auth)
POST /authorization/        # Create auth credentials
GET  /ecommerce/...         # Integration endpoints (public)
*    /anuncio/...           # Product routes (requires auth headers)
```

## Marketplace Types

```javascript
// types/marketplaceTypes.js
nuvem_shop: 1
mercado_livre: 2
tiny: 8
mercos: 10
```

## Common Pitfalls

- Running from repo root instead of `src/`
- Adding `require()` syntax (project uses ESM)
- Missing `.env` file (dotenv-safe throws)
- Assuming single database (both MongoDB and Firebird are active)
- Creating routes without auth middleware where needed