# DevPulse API

> Internal tech issue & feature tracker for software teams — report bugs, suggest features, and coordinate resolutions.

**Live URL:** 

---

## Features

- User registration and login with JWT authentication
- Role-based access control (`contributor` / `maintainer`)
- Full CRUD for issues (bug reports and feature requests)
- Filter issues by type and status; sort by newest or oldest
- Reporter details included in issue responses (no SQL JOINs)
- Centralized error handling and consistent JSON response format

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 24 (LTS) |
| Language | TypeScript 5 (strict mode, no `any`) |
| Framework | Express.js 4 |
| Database | PostgreSQL — raw SQL via `pg` driver only |
| Auth | `jsonwebtoken` (JWT) |
| Password hashing | `bcrypt` (10 salt rounds) |
| HTTP status codes | `http-status-codes` |
| Environment config | `dotenv` |
| CORS | `cors` |
| Testing | Jest + ts-jest |

No ORM, no query builder, no SQL JOINs. All database access uses parameterized `pool.query()` calls.

---

## Local Setup

### Prerequisites

- Node.js 24+
- PostgreSQL 14+

### Steps

```bash
# 1. Clone the repo
git clone https://github.com/rushdv/devpulse.git
cd devpulse

# 2. Install dependencies
npm install

# 3. Set up environment variables
cp .env.example .env
# Edit .env and fill in DATABASE_URL and JWT_SECRET

# 4. Create tables
psql -U <pg_user> -d <database> -f schema.sql

# 5. Start dev server
npm run dev
```

### Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start with `ts-node` (development) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled output |
| `npm test` | Run test suite |

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `JWT_SECRET` | ✅ | Secret key for signing JWTs |
| `PORT` | ❌ | HTTP port (default: `3000`) |

---

## Database Schema

```sql
CREATE TABLE IF NOT EXISTS users (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(255)        NOT NULL,
  email       VARCHAR(255) UNIQUE NOT NULL,
  password    TEXT                NOT NULL,
  role        VARCHAR(20)         NOT NULL DEFAULT 'contributor'
                CHECK (role IN ('contributor', 'maintainer')),
  created_at  TIMESTAMPTZ         NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ         NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS issues (
  id           SERIAL PRIMARY KEY,
  title        VARCHAR(150)  NOT NULL,
  description  TEXT          NOT NULL,
  type         VARCHAR(30)   NOT NULL CHECK (type IN ('bug', 'feature_request')),
  status       VARCHAR(20)   NOT NULL DEFAULT 'open'
                 CHECK (status IN ('open', 'in_progress', 'resolved')),
  reporter_id  INTEGER       NOT NULL,
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
```

---

## Role Permissions

| Action | Contributor | Maintainer |
|---|---|---|
| Register / Login | ✅ | ✅ |
| Create an issue | ✅ | ✅ |
| View all issues | ✅ | ✅ |
| Update own issue (status must be `open`) | ✅ | ✅ |
| Update any issue / change status | ❌ | ✅ |
| Delete any issue | ❌ | ✅ |

---

## API Endpoints

Base URL: `/api`

All responses follow this shape:

```json
{ "success": true, "message": "...", "data": { ... } }
{ "success": false, "message": "...", "errors": "..." }
```

Protected routes require a JWT in the `Authorization` header (no `Bearer` prefix):

```
Authorization: <your_jwt_token>
```

---

### Auth

| Method | Endpoint | Access | Description |
|---|---|---|---|
| POST | `/api/auth/signup` | Public | Register a new user |
| POST | `/api/auth/login` | Public | Login and receive JWT |

#### POST /api/auth/signup

```json
// Request
{ "name": "John Doe", "email": "john@example.com", "password": "secret123", "role": "contributor" }

// Response 201
{
  "success": true,
  "message": "User registered successfully",
  "data": { "id": 1, "name": "John Doe", "email": "john@example.com", "role": "contributor", "created_at": "...", "updated_at": "..." }
}
```

#### POST /api/auth/login

```json
// Request
{ "email": "john@example.com", "password": "secret123" }

// Response 200
{
  "success": true,
  "message": "Login successful",
  "data": {
    "token": "<jwt>",
    "user": { "id": 1, "name": "John Doe", "email": "john@example.com", "role": "contributor", "created_at": "...", "updated_at": "..." }
  }
}
```

---

### Issues

| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/api/issues` | Public | List all issues (filterable) |
| GET | `/api/issues/:id` | Public | Get a single issue |
| POST | `/api/issues` | Authenticated | Create a new issue |
| PATCH | `/api/issues/:id` | Authenticated | Update an issue |
| DELETE | `/api/issues/:id` | Maintainer only | Delete an issue |

#### GET /api/issues

Query params: `sort` (`newest`\|`oldest`), `type` (`bug`\|`feature_request`), `status` (`open`\|`in_progress`\|`resolved`)

```json
// Response 200
{
  "success": true,
  "data": [{
    "id": 45, "title": "...", "description": "...", "type": "bug", "status": "open",
    "reporter": { "id": 1, "name": "John Doe", "role": "contributor" },
    "created_at": "...", "updated_at": "..."
  }]
}
```

#### POST /api/issues

```json
// Request (Authorization header required)
{ "title": "Bug title here", "description": "At least 20 characters long description", "type": "bug" }

// Response 201
{
  "success": true,
  "message": "Issue created successfully",
  "data": { "id": 45, "title": "...", "description": "...", "type": "bug", "status": "open", "reporter_id": 1, "created_at": "...", "updated_at": "..." }
}
```

#### PATCH /api/issues/:id

- **Maintainer** — can update any issue (including `status`)
- **Contributor** — can only update their own issue when `status` is `open`

```json
// Request body (all fields optional)
{ "title": "Updated title", "description": "Updated description text here", "type": "feature_request" }

// Response 200
{ "success": true, "message": "Issue updated successfully", "data": { ... } }
```

#### DELETE /api/issues/:id

```json
// Response 200
{ "success": true, "message": "Issue deleted successfully" }
```

---

## HTTP Status Codes

| Code | Usage |
|---|---|
| 200 | Successful GET, PATCH, DELETE |
| 201 | Resource created |
| 400 | Validation error / duplicate resource |
| 401 | Missing or invalid JWT |
| 403 | Insufficient role/permissions |
| 404 | Resource not found |
| 409 | Business logic conflict |
| 500 | Unexpected server error |

---

## Project Structure

```
devpulse/
├── src/
│   ├── app.ts                    # Express app, middleware, global error handler
│   ├── server.ts                 # HTTP server entry point
│   ├── config/
│   │   └── db.ts                 # pg.Pool initialization
│   ├── middleware/
│   │   ├── authenticate.ts       # JWT verification
│   │   └── authorize.ts          # Role-based access control
│   ├── modules/
│   │   ├── auth/
│   │   │   ├── auth.controller.ts
│   │   │   ├── auth.router.ts
│   │   │   └── auth.service.ts
│   │   └── issues/
│   │       ├── issues.controller.ts
│   │       ├── issues.router.ts
│   │       └── issues.service.ts
│   └── utils/
│       ├── asyncHandler.ts       # Wraps async handlers, forwards errors to next()
│       └── response.ts           # sendSuccess() / sendError() helpers
├── schema.sql                    # PostgreSQL table definitions
├── .env.example                  # Environment variable template
├── package.json
└── tsconfig.json
```

---

## License

[MIT](./LICENSE)
