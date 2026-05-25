# OEC Ops — Claude Context

## What This Is
Internal ops platform for One Estate Coffee (OEC). Manages green lots, roast sessions, cupping, allocations, buyer contacts, and journal documentation. Multi-tenant, role-gated (admin / roaster / viewer).

## Stack
- Frontend: React + Vite + Tailwind (custom `coffee-*` color scale)
- Backend: Node.js + Express, PostgreSQL (pg Pool)
- Auth: JWT access + refresh tokens in localStorage
- Realtime: WebSocket `/ws/roast-live` (roast hardware mock)
- Deploy: Render — Express serves built frontend in production

## Running Locally
```bash
cd server && npm run dev     # API on :3001
cd client && npm run dev     # UI on :5173 (proxied to 3001)
```

## Key Conventions
- All frontend API calls use `client/src/lib/api.js` — auto-refreshes token on 401
- Every DB table has `tenant_id` — always filter by it in queries
- Role checks: `requireRole('admin')` on backend, `user?.role === 'admin'` on frontend
- Status badge colors: draft=grey, under_review=amber, published=green, missing=red-outline
- Process colors: Washed=blue, Honey=amber, Natural=green, Anaerobic=purple

## Module Status (as of 2026-05-25)
| Module | DB | Backend | Frontend |
|--------|----|---------|----------|
| Auth | ✅ | ✅ | ✅ |
| Lots / Inventory | ✅ | ✅ | ✅ |
| Roast Sessions | ✅ | ✅ | ✅ |
| Allocations | ✅ | ✅ | ✅ |
| Roast Profiles | ✅ | ✅ | ✅ |
| Cupping | ✅ | ✅ | ✅ |
| Labels | ✅ | ✅ | ✅ |
| Contacts (M7) | ✅ | ✅ | ✅ |
| Journal (M8) | ✅ | ✅ | ✅ |

## All Modules Complete — Platform is fully operational.

## File Layout
```
client/src/pages/
  allocations/     AllocationDashboard, AllocationNew, AllocationDetail, AllocationAddRequest
  contacts/        ContactList, ContactForm, ContactDetail, ContactPrivateList
  cupping/         CuppingList, CuppingNew, CuppingDetail, CuppingCompare
  journal/         JournalDashboard, JournalEntry
  labels/          LabelPreview
  profiles/        ProfileList, ProfileNew, ProfileDetail, ProfileEdit
  roast/           RoastList, RoastNew, RoastLive, RoastDetail
  Dashboard.jsx, Inventory.jsx, Login.jsx, LotDetail.jsx

server/src/routes/
  auth.js, lots.js, roastSessions.js, allocations.js
  profiles.js, cupping.js, labels.js, contacts.js, journal.js

db/migrations/
  001–015 all applied
```
