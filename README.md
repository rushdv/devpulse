# DevPulse API

Internal tech issue & feature tracker — report bugs, suggest features, and coordinate resolutions.

**Live URL:** `https://devpulse-rqz6.onrender.com`

---

## Tech Stack

| | |
|---|---|
| Runtime | Node.js 24 (LTS) |
| Language | TypeScript 5 (strict) |
| Framework | Express.js 4 |
| Database | PostgreSQL — raw SQL via `pg` driver |
| Auth | JWT (`jsonwebtoken`) |
| Password hashing | bcrypt (10 salt rounds) |

No ORM, no query builder, no SQL JOINs.

---

## Local Setup

```bash
git clone https://github.com/rushdv/devpulse.git
cd devpulse
npm install
cp .env.example .env   # fill in DATABASE_URL and JWT_SECRET
psql -U <user> -d <db> -f schema.sql
npm run dev
```

| Command | |
|---|---|
| `npm run dev` | Start dev server |
| `npm run build` | Compile to `dist/` |
| `npm start` | Run compiled output |
| `npm test` | Run tests |

---

## Environment Variables

| Variable | Required | |
|---|---|---|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `JWT_SECRET` | ✅ | Secret for signing JWTs |
| `PORT` | ❌ | Default: `3000` |

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

## API Endpoints

All responses: `{ success, message, data }` or `{ success, message, errors }`

Protected routes require `Authorization: <token>` header (no Bearer prefix).

### Auth

| Method | Endpoint | Access |
|---|---|---|
| POST | `/api/auth/signup` | Public |
| POST | `/api/auth/login` | Public |

### Issues

| Method | Endpoint | Access |
|---|---|---|
| GET | `/api/issues` | Public |
| GET | `/api/issues/:id` | Public |
| POST | `/api/issues` | Authenticated |
| PATCH | `/api/issues/:id` | Authenticated |
| DELETE | `/api/issues/:id` | Maintainer only |

`GET /api/issues` supports query params: `sort` (newest/oldest), `type` (bug/feature_request), `status` (open/in_progress/resolved)

---

## Roles

| Action | Contributor | Maintainer |
|---|---|---|
| Register / Login | ✅ | ✅ |
| Create / View issues | ✅ | ✅ |
| Update own issue (only if `open`) | ✅ | ✅ |
| Update any issue / change status | ❌ | ✅ |
| Delete any issue | ❌ | ✅ |

---

## Project Structure

```
src/
├── app.ts
├── server.ts
├── config/db.ts
├── middleware/
│   ├── authenticate.ts
│   └── authorize.ts
├── modules/
│   ├── auth/
│   └── issues/
└── utils/
    ├── asyncHandler.ts
    └── response.ts
```

---

## License

[MIT](./LICENSE)
