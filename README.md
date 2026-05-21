# DevPulse

A production-ready REST API for issue tracking in software teams. DevPulse provides user authentication with role-based access control and full CRUD operations for issues.

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js |
| Language | TypeScript 5 (strict mode) |
| Framework | Express.js 4 |
| Database | PostgreSQL (raw SQL via `pg` driver) |
| Authentication | JSON Web Tokens (`jsonwebtoken`) |
| Password hashing | bcrypt (10 salt rounds) |
| Environment config | dotenv |
| CORS | cors |
| Testing | Jest + ts-jest + fast-check |

No ORM, no query builder. All database access uses parameterized raw SQL queries.

---

## Setup

### Prerequisites

- Node.js 18+
- PostgreSQL 14+

### Steps

1. **Clone the repository**

   ```bash
   git clone <repository-url>
   cd devpulse
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Configure environment variables**

   ```bash
   cp .env.example .env
   ```

   Open `.env` and fill in your values (see [Environment Variables](#environment-variables) below).

4. **Create the database and run the schema**

   ```bash
   psql -U <your_pg_user> -d <your_database> -f schema.sql
   ```

   Or connect to your PostgreSQL instance and run the contents of `schema.sql` directly.

5. **Start the development server**

   ```bash
   npm run dev
   ```

   The server will start on the port defined in your `.env` (default: `3000`).

### Other Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start with `ts-node` (development) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled output from `dist/` |
| `npm test` | Run the full test suite |

---

## Environment Variables

| Variable | Required | Description | Example |
|---|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string | `postgresql://user:password@localhost:5432/devpulse` |
| `JWT_SECRET` | Yes | Secret key used to sign and verify JWTs | `a-long-random-secret-string` |
| `PORT` | No | Port the HTTP server listens on | `3000` (default) |

The application will throw an error on startup if `DATABASE_URL` is not set.

---

## Role Permissions

DevPulse has two roles: **contributor** and **maintainer**.

| Action | Contributor | Maintainer |
|---|---|---|
| Register / Login | ✅ | ✅ |
| Create an issue | ✅ | ✅ |
| List all issues | ✅ | ✅ |
| Get a single issue | ✅ | ✅ |
| Update own issue (status must be `open`) | ✅ | ✅ |
| Update any issue | ❌ | ✅ |
| Delete any issue | ❌ | ✅ |

---

## API Reference

All responses follow a consistent JSON shape:

**Success**
```json
{ "success": true, "message": "...", "data": { ... } }
```

**Error**
```json
{ "success": false, "message": "...", "errors": { ... } }
```

The `data` and `errors` fields are omitted when not applicable.

### Authentication

Protected routes require a JWT in the `Authorization` header. The token is sent as a raw value — no `Bearer` prefix:

```
Authorization: <your_jwt_token>
```

---

### POST /api/auth/signup

Register a new user account.

**Auth required:** No

**Request body**

```json
{
  "name": "Alice",
  "email": "alice@example.com",
  "password": "secret123",
  "role": "contributor"
}
```

| Field | Type | Rules |
|---|---|---|
| `name` | string | Required |
| `email` | string | Required, must be unique |
| `password` | string | Required, stored as bcrypt hash |
| `role` | string | Required, must be `contributor` or `maintainer` |

**Response — 201 Created**

```json
{
  "success": true,
  "message": "User registered successfully",
  "data": {
    "id": "uuid",
    "name": "Alice",
    "email": "alice@example.com",
    "role": "contributor",
    "created_at": "2024-01-01T00:00:00.000Z"
  }
}
```

**Error responses**

| Status | Condition |
|---|---|
| 400 | Missing required field |
| 400 | Invalid `role` value |
| 400 | Email already in use |

---

### POST /api/auth/login

Authenticate and receive a JWT.

**Auth required:** No

**Request body**

```json
{
  "email": "alice@example.com",
  "password": "secret123"
}
```

**Response — 200 OK**

```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "token": "<jwt>",
    "user": {
      "id": "uuid",
      "name": "Alice",
      "email": "alice@example.com",
      "role": "contributor",
      "created_at": "2024-01-01T00:00:00.000Z"
    }
  }
}
```

**Error responses**

| Status | Condition |
|---|---|
| 400 | Missing `email` or `password` |
| 401 | Email not found or password incorrect |

---

### GET /api/issues

Retrieve all issues with optional filtering and sorting.

**Auth required:** No

**Query parameters**

| Parameter | Values | Description |
|---|---|---|
| `sort` | `newest` (default), `oldest` | Sort by `created_at` descending or ascending |
| `type` | `bug`, `feature_request` | Filter by issue type |
| `status` | `open`, `in_progress`, `resolved` | Filter by issue status |

**Response — 200 OK**

```json
{
  "success": true,
  "message": "Issues retrieved successfully",
  "data": [
    {
      "id": "uuid",
      "title": "Login button broken",
      "description": "The login button does not respond on mobile devices.",
      "type": "bug",
      "status": "open",
      "created_at": "2024-01-01T00:00:00.000Z",
      "updated_at": "2024-01-01T00:00:00.000Z",
      "reporter": {
        "id": "uuid",
        "name": "Alice",
        "role": "contributor"
      }
    }
  ]
}
```

**Error responses**

| Status | Condition |
|---|---|
| 400 | Invalid `type` or `status` query parameter value |

---

### GET /api/issues/:id

Retrieve a single issue by ID.

**Auth required:** No

**URL parameters**

| Parameter | Description |
|---|---|
| `id` | UUID of the issue |

**Response — 200 OK**

```json
{
  "success": true,
  "message": "Issue retrieved successfully",
  "data": {
    "id": "uuid",
    "title": "Login button broken",
    "description": "The login button does not respond on mobile devices.",
    "type": "bug",
    "status": "open",
    "created_at": "2024-01-01T00:00:00.000Z",
    "updated_at": "2024-01-01T00:00:00.000Z",
    "reporter": {
      "id": "uuid",
      "name": "Alice",
      "role": "contributor"
    }
  }
}
```

**Error responses**

| Status | Condition |
|---|---|
| 404 | Issue not found |

---

### POST /api/issues

Create a new issue.

**Auth required:** Yes (any authenticated user)

**Request body**

```json
{
  "title": "Login button broken",
  "description": "The login button does not respond on mobile devices.",
  "type": "bug"
}
```

| Field | Type | Rules |
|---|---|---|
| `title` | string | Required, max 150 characters |
| `description` | string | Required, min 20 characters |
| `type` | string | Required, must be `bug` or `feature_request` |

The `reporter_id` is set automatically from the authenticated user's JWT — it cannot be supplied in the request body.

**Response — 201 Created**

```json
{
  "success": true,
  "message": "Issue created successfully",
  "data": {
    "id": "uuid",
    "title": "Login button broken",
    "description": "The login button does not respond on mobile devices.",
    "type": "bug",
    "status": "open",
    "reporter_id": "uuid",
    "created_at": "2024-01-01T00:00:00.000Z",
    "updated_at": "2024-01-01T00:00:00.000Z"
  }
}
```

**Error responses**

| Status | Condition |
|---|---|
| 400 | Missing required field |
| 400 | `title` exceeds 150 characters |
| 400 | `description` is shorter than 20 characters |
| 400 | Invalid `type` value |
| 401 | Missing or invalid JWT |

---

### PATCH /api/issues/:id

Update an existing issue's `title`, `description`, and/or `type`.

**Auth required:** Yes

**URL parameters**

| Parameter | Description |
|---|---|
| `id` | UUID of the issue |

**Request body** (all fields optional)

```json
{
  "title": "Updated title",
  "description": "Updated description with enough characters.",
  "type": "feature_request"
}
```

Only `title`, `description`, and `type` can be updated. Any `status` or `reporter_id` fields in the body are ignored.

**Authorization rules**

- **Maintainer** — can update any issue
- **Contributor** — can only update their own issues, and only when the issue's `status` is `open`

**Response — 200 OK**

```json
{
  "success": true,
  "message": "Issue updated successfully",
  "data": {
    "id": "uuid",
    "title": "Updated title",
    "description": "Updated description with enough characters.",
    "type": "feature_request",
    "status": "open",
    "created_at": "2024-01-01T00:00:00.000Z",
    "updated_at": "2024-01-02T00:00:00.000Z",
    "reporter": {
      "id": "uuid",
      "name": "Alice",
      "role": "contributor"
    }
  }
}
```

**Error responses**

| Status | Condition |
|---|---|
| 400 | Validation failure (title too long, description too short, invalid type) |
| 401 | Missing or invalid JWT |
| 403 | Contributor attempting to update another user's issue |
| 404 | Issue not found |
| 409 | Contributor attempting to update an issue that is not `open` |

---

### DELETE /api/issues/:id

Delete an issue. Maintainers only.

**Auth required:** Yes (maintainer role only)

**URL parameters**

| Parameter | Description |
|---|---|
| `id` | UUID of the issue |

**Response — 200 OK**

```json
{
  "success": true,
  "message": "Issue deleted successfully"
}
```

**Error responses**

| Status | Condition |
|---|---|
| 401 | Missing or invalid JWT |
| 403 | Authenticated user is not a maintainer |
| 404 | Issue not found |

---

## Project Structure

```
devpulse/
├── src/
│   ├── app.ts                        # Express app setup and middleware
│   ├── server.ts                     # Entry point — starts HTTP server
│   ├── config/
│   │   └── db.ts                     # pg.Pool initialization
│   ├── middleware/
│   │   ├── authenticate.ts           # JWT verification middleware
│   │   └── authorize.ts              # Role-based access control middleware
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
│       ├── asyncHandler.ts           # Wraps async handlers, forwards errors to next()
│       └── response.ts               # sendSuccess() and sendError() helpers
├── schema.sql                        # PostgreSQL table definitions
├── .env.example                      # Environment variable template
├── package.json
└── tsconfig.json
```

---

## License

See [LICENSE](./LICENSE).
