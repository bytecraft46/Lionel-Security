# Lionel Security (Pvt) Ltd — Centralised Guard Deployment & Security Operations

Operational Command & Control MIS for ~200 deployed guards across 3 Karachi zones and 17 client
locations. **Strictly operational:** no salary, payroll, overtime pay, deductions, client billing,
invoicing or location profitability exists in the database, API or UI.

---

## Architecture

| Layer | Stack |
|---|---|
| API & realtime | Python 3.12, Flask 3, Flask-SocketIO, SQLAlchemy 2, SQLite (WAL) |
| Command console | React 18, Vite 6, Tailwind CSS 3, Leaflet, Socket.IO client |
| Auth | Signed HS256 JWTs (PyJWT), refresh rotation, revocation denylist, Flask-Limiter |
| Field app | Existing Flutter/React Native clients under `mobile-client/` |

```
backend/
  app.py                 app factory, CORS, security headers, Socket.IO JWT handshake
  config.py              env-driven configuration (no secrets in code)
  security.py            JWT issue/verify, RBAC decorators, zone scoping, audit helper
  models.py              operational schema (20 tables)
  services.py            strength, availability, RAG status, SITREP calculations
  routes/auth.py         login, refresh, logout, /me, admin-only provisioning, device lock
  routes/dashboard.py    overview, locations, roster, QR token, SITREP
  routes/personnel.py    guard registry, leave requests and decisions
  routes/operations.py   attendance (GPS+QR anti-spoofing), armoury, manual entry
  routes/command.py      broadcasts/acks, incidents, inspections, documents, audit log
  seed_lionel.py         idempotent Lionel/Karachi seed
  tests/test_security.py security regression suite (19 tests)
admin-dashboard/
  src/config/api.js      single API/socket origin
  src/lib/http.js        authenticated client, 401 → refresh → retry, forced logout
  src/lib/socket.js      single socket + stale-closure-safe event hook
  src/components/        ui primitives, layout shell, map (MapResizer + pin factory)
  src/pages/             SignIn, CEO, Ops Manager and Supervisor dashboards
```

---

## Getting started

### 1. Backend

```bash
cd backend
python -m pip install -r requirements.txt
cp .env.example .env        # then set SECRET_KEY and JWT_SECRET_KEY
python seed_lionel.py       # idempotent zones, posts, guards, rosters, armoury
python app.py               # http://localhost:5015
```

Generate secrets with:

```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

If `JWT_SECRET_KEY` is absent a random per-process key is generated, which invalidates
sessions on restart — set it in `.env` for stable local sessions.

### 2. Command console

```bash
cd admin-dashboard
npm install
npm run dev                 # http://localhost:3015
```

`VITE_API_BASE_URL` / `VITE_SOCKET_URL` override the default `http://localhost:5015`.

### Development seed logins

Set `SEED_CEO_PASSWORD`, `SEED_OPS_PASSWORD`, `SEED_SUPERVISOR_PASSWORD` and
`SEED_GUARD_PASSWORD` in `backend/.env` **before** seeding to choose your own passwords. When
unset, `seed_lionel.py` falls back to development-only defaults; change them before any real
deployment.

Accounts: `ceo@lionel.pk`, `ops@lionel.pk`, `admin@lionel.pk`, `supervisor1@lionel.pk` …
`supervisor3@lionel.pk`.

---

## Security model

- **JWT**: HS256 only, `exp` on every token (45 min access / 7 day refresh), `jti` denylist on
  logout, refresh-token rotation, `token_version` invalidates sessions after password change.
- **Passwords**: bcrypt; a missing/`NULL` hash can never authenticate; 10+ characters with mixed
  case, digit and symbol. Login is rate limited to 5 attempts/minute per IP + identifier.
- **RBAC**: `CEO`, `OPS_MANAGER`, `SUPERVISOR`, `GUARD`, `ADMIN`. Every API route is authenticated.
  Privileged accounts can only be created by `ADMIN`; `creator_id`/`role` are never trusted from
  the client.
- **Zone isolation (IDOR)**: supervisors only see and mutate their assigned zones. Cross-zone
  location, guard, roster, weapon, incident or attendance access returns `403`.
- **Sockets**: handshake requires a valid JWT; clients join `ceo_command`, `ops_command` or
  `zone_<id>` rooms. Broadcasts are never global.
- **Attendance anti-spoofing**: Haversine/polygon geofence, rotating daily QR token, mock-GPS
  detection. Out-of-fence, wrong-QR or mock punches are stored as `FLAGGED_ANOMALY` and rejected
  with `422`; no coordinate substitution and no fabricated biometric confidence.
- **Audit trail**: immutable `audit_logs` for logins, user/guard changes, leave decisions,
  attendance, weapons, broadcasts, incidents, inspections, documents and downloads.
- **Uploads**: PDF/JPG/PNG only, 10 MB ceiling, random stored names outside the web root, served
  through an authenticated, scoped download endpoint.
- **Transport hygiene**: explicit CORS allowlist, `nosniff`, `DENY` framing,
  `strict-origin-when-cross-origin`, `no-store` on API responses.

### Verification

```bash
cd backend
python -m pytest tests -q
```

Covers unauthenticated access to all protected endpoints and Socket.IO, null-password accounts,
login brute-force limiting, supervisor zone isolation (read and mutate), flagged/rejected
out-of-geofence & invalid-QR punches, schema/payload/UI checks for financial fields, and
token revocation on logout.

---

## Role dashboards

- **CEO** — posture KPIs, zone/location RAG matrix, read-only roster drawer, management-attention
  list, active emergencies & client complaints with action-taken status, expiry/compliance risk,
  one-click daily SITREP export.
- **Ops Manager** — live control room: deployment tree by zone/supervisor, Leaflet operations map,
  live attendance stream with verification source, command broadcast composer and
  received/not-received + action-taken tracker, armoury status, pending leave, incident triage.
- **Supervisor** — zone-scoped locations and roster verification (status, overtime hours,
  replacement guard), command alert acknowledgement and action notes, daily/surprise inspection
  log, incident & client complaint reporting, weapons physical verification.

Traffic-light convention: **green** operational, **yellow** attention required, **red**
emergency/absent/non-compliance.

---

## Operational API (summary)

| Method | Endpoint | Roles |
|---|---|---|
| POST | `/api/auth/login`, `/api/auth/refresh`, `/api/auth/logout` | public / authenticated |
| GET | `/api/auth/me` | any |
| GET | `/api/dashboard/overview`, `/api/locations`, `/api/zones` | command + supervisor (scoped) |
| GET | `/api/locations/<id>/roster`, `/api/locations/<id>/qr-token` | command + supervisor |
| GET | `/api/reports/sitrep` (`?format=text`) | command + supervisor |
| GET/POST/PUT | `/api/guards`, `/api/guards/<id>` | admin/ops/supervisor (zone scoped) |
| GET/POST | `/api/leave`, `/api/leave/<id>/decision` | self / supervisory |
| POST | `/api/attendance/punch`, `/api/attendance/manual` | guard self / supervisor |
| POST | `/api/attendance/<id>/verify` | supervisor+ |
| GET/POST | `/api/weapons`, `/api/weapons/<id>/issue|return|verify|logs` | staff (zone scoped) |
| GET/POST | `/api/broadcasts`, `/api/broadcasts/<id>/ack` | command / recipients |
| GET/POST/PUT | `/api/incidents`, `/api/incidents/<id>` | reporters / supervisory |
| GET/POST | `/api/inspections` | supervisor+ |
| GET/POST | `/api/documents`, `/api/documents/<id>/download` | staff (scoped) |
| GET | `/api/audit-logs` | ADMIN |
