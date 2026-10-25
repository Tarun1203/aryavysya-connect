# Arya Vysya Vamsha Vruksham

A verified, multi-user family tree for the Arya Vysya community. It is available in English, Telugu, Kannada and Tamil.

## Who can do what

| Role | Scope | Can |
|---|---|---|
| **Super admin** | Platform owner | Everything: gotras, districts and all community bodies; appoints state heads |
| **State head** (Mahasabha / Mahamandali / Akhila Bharatha Sangham) | One state | Approves members, edits records, creates district and local bodies, appoints district in-charges and local admins |
| **District in-charge** (one per district) | One district, including all its local sanghas and sabhas | Gives final approval to members, edits records in the district, creates local bodies, appoints local admins |
| **Local sangha / sabha admin** | Their own sangha or sabha | Endorses members of their body before the in-charge approves; otherwise edits like a member |
| **Member** (verified) | Their own family | Edits self, siblings, ancestors up to 5 generations, descendants down to 5, and the spouses of those people |

Registration creates a *pending* account and a membership request. If the member chose a local body, its admin endorses the request. The district in-charge (or a state head or the super admin) then approves it. Approval either links the member to an existing person in the tree or creates a new person for them. Every change is written to an audit log.

The **gotra match** page flags same-gotra (sagotra) pairs and close blood relatives, and recognises cross-cousin (menarikam) matches. It is advisory only.

## Stack

- Next.js 16 (App Router, server actions) with React 19, TypeScript and Tailwind CSS 4
- PostgreSQL with Prisma 7 (`@prisma/adapter-pg`)
- next-intl for `/en`, `/te`, `/kn` and `/ta`
- Sessions are a signed JWT in an httpOnly cookie (jose), and passwords are hashed with bcrypt

Rules live in `src/lib/family.ts` (5-generation scope, gotra match) and `src/lib/permissions.ts` (roles).

## Run locally

```bash
npm install
cp .env.example .env          # then set AUTH_SECRET to a long random string
npm run db:dev                # local Postgres on :5433 (no Docker needed); leave it running
npx prisma migrate deploy
npm run db:seed               # 102 gotras, AP and Telangana districts, super admin; demo data if SEED_DEMO_PASSWORD is set
npm run dev                   # http://localhost:3000
```

The demo seed creates a family spanning 8 generations and one account for each role (`state.head@`, `guntur.incharge@`, `tenali.sangham@` and `srinivas@example.com`, plus `ravi@example.com`, which is pending). They all use `SEED_DEMO_PASSWORD`. **Leave it empty in production.**

## Deploy to the cloud

The container runs `prisma migrate deploy` and the seed on every start; the seed only upserts, so it is safe to repeat. It then starts Next.js on `$PORT`.

**Render (one click):** push this folder to GitHub, then go to Render → New → Blueprint and select the repo. `render.yaml` creates the web service and a managed Postgres, and generates `AUTH_SECRET`. Set `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` when prompted.

**Any Docker host (Google Cloud Run, Railway, Fly.io, AWS):**

```bash
docker build -t arya-vysya-tree .
docker run -p 3000:3000 -e DATABASE_URL=... -e AUTH_SECRET=... -e SEED_ADMIN_EMAIL=... -e SEED_ADMIN_PASSWORD=... arya-vysya-tree
```

Use a managed Postgres such as Neon, Supabase, Cloud SQL or RDS.

After the first deploy, sign in as the super admin. Then use **Administration → Sanghas, sabhas & in-charges** to add the state Mahasabhas and appoint their heads. The state heads then appoint district in-charges, who add their local sanghas and sabhas.

## Data to review before launch

- `prisma/data/gotras.ts`: the 102 gotras, transcribed from vaasavi.net. Spellings vary between sources, so have the Mahasabhas verify the list. Local-script names can be added under **Administration → Gotras & districts**.
- `prisma/data/districts.ts`: Andhra Pradesh and Telangana only. Add Karnataka, Tamil Nadu and any new districts from the admin page.
- `messages/te.json`, `messages/kn.json` and `messages/ta.json` need a review by native speakers.
