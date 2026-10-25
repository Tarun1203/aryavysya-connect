# aryavysya-connect
All-in-one community platform for the Arya Vysya community — genealogy, member directory, forum, groups, and a multi-level governance structure (Area to All India). Mobile + web. community-platform · genealogy · family-tree · social-network · nodejs · postgresql · react-native · india
# Aryavysya Connect

> All-in-one community platform for the Arya Vysya community — genealogy, member directory, forum, groups, and a multi-level governance structure (Area to All India). Mobile + web.

**Official name:** All India Aryavysya Bandhu Mitra Connect (AIAVBMC)

> ⚠️ **Status: Early planning / in development.** This README describes the intended platform. APIs, schema, and setup steps will change.

---

## Overview

Aryavysya Connect is a community platform that brings the Arya Vysya community together in one place — a verified member base, a community-wide genealogy, social and discussion features, and the organizational hierarchy that runs from local **Areas** up to the **All India** body.

It targets members across Maharashtra, Andhra Pradesh, Telangana, Odisha, Karnataka, and smaller communities in Madhya Pradesh, Tamil Nadu, and Chhattisgarh.

## Modules

1. **Membership & Identity** — one verified record per member (name, gotra/lineage, native place, contact, body memberships). Phone-number + OTP login.
2. **Genealogy** — a community-wide family tree. Each person is a node; parent/spouse/child are links. Families connect through marriages, with deduplication to merge the same person entered by different families.
3. **Governance / Org structure** — a nine-level hierarchy with incharges and committees at each level and permissions that cascade downward.
4. **Community & Social** — forum, feed, groups, messaging, and directory search.
5. **Sabhas & Events** — meeting announcements, event registration, and notices from each body to its members.

## Governance hierarchy

Authority cascades from the top down; each level manages everything beneath it.

```
All India (Akhila Bharata)
        └── State
              └── Division
                    └── District
                          └── City
                                └── Town
                                      └── Local Body
                                            └── Club
                                                  └── Area  (members)
```

## Tech stack (proposed)

| Layer | Choice |
| --- | --- |
| Backend | Node/NestJS, Django, or Laravel |
| Database | PostgreSQL |
| Mobile | Flutter or React Native |
| Web | Shared web app |
| Auth | Phone number + OTP |

## Roadmap

- **Phase 1 — Pilot (one district, Karnataka):** Membership + Genealogy data model, plus one level of governance.
- **Phase 2:** Expand genealogy and governance state by state.
- **Phase 3:** Community, social, and events modules.
- **Phase 4:** National rollout.

> The first slice to build is the **Membership + Genealogy data model** — the person record, the family links, and the deduplication rule. Everything else attaches to it.

## Privacy & compliance

Genealogy and member data is sensitive personal data. The platform must comply with India's **Digital Personal Data Protection Act (2023)** — member consent and privacy controls are built in from day one, not added later.

## Current implementation (v0.1 web prototype)

This repository contains a working web prototype of the **Membership + Genealogy** slice, with part of the governance structure. It is available in English, Telugu, Kannada and Tamil.

**Built so far**

- **Verified membership:** a member registers and picks their district and, optionally, a local sangha or sabha. The local body endorses the member, then the district in-charge approves and links them to their node in the tree.
- **Genealogy:** person records with gotra by birth (all 102 Arya Vysya gotras), intiperu, native place, nakshatra, rasi, kuladevata and death tithi. Records are linked as parent, child and spouse, with ancestor and descendant views and search.
- **Edit rules:** a member can edit only their own family: siblings, ancestors up to 5 generations, descendants down to 5, and the spouses of those people. Every change is written to an audit log.
- **Marriage check:** flags same-gotra (sagotra) pairs and close blood relatives, and recognises cross-cousin (menarikam) matches.
- **Governance (4 of the 9 levels so far):** Super admin, then State (Mahasabha / Mahamandali / Akhila Bharatha Sangham), then District (one in-charge per district), then Local sangha / sabha.

**Gaps against the plan above**

- **Login:** email and password, not phone OTP.
- **Hierarchy:** the Division, City, Town, Club and Area levels are not built yet.
- **Data and privacy:** there is no deduplication or merging of people entered twice, and no DPDP consent records.
- **Modules not started:** community, social and events.
- **Mobile:** none yet.

**Stack used:** Next.js 16 (React 19, server actions) with TypeScript and Tailwind CSS 4, PostgreSQL with Prisma 7, and next-intl. Sessions are a signed JWT in an httpOnly cookie.

Key code:

- `src/lib/family.ts`: the 5-generation scope and the gotra match
- `src/lib/permissions.ts`: roles
- `prisma/schema.prisma`: the data model

## Getting started

Requires Node.js 22 or later. Postgres is optional, because a local Postgres is bundled for development.

```bash
git clone https://github.com/Tarun1203/aryavysya-connect.git
cd aryavysya-connect
npm install
cp .env.example .env          # set AUTH_SECRET to a long random string
npm run db:dev                # local UTF-8 Postgres on :5433; leave it running
npx prisma migrate deploy
npm run db:seed               # gotras, AP and Telangana districts, super admin; demo data if SEED_DEMO_PASSWORD is set
npm run dev                   # http://localhost:3000
```

The demo seed creates a family spanning 8 generations and one account for each role:

- `state.head@example.com`
- `guntur.incharge@example.com`
- `tenali.sangham@example.com`
- `srinivas@example.com`
- `ravi@example.com` (pending)

They all use `SEED_DEMO_PASSWORD`. **Leave it empty in production.**

### Deploy for free (Render + Neon)

The container runs `prisma migrate deploy` and the seed on every start; the seed only upserts, so it is safe to repeat. It then starts the app on `$PORT`.

1. **Database (Neon, free).** Create a project in the **AWS Asia Pacific (Singapore)** region, or link this repo to one with `neon init`. Then run `neon env pull`, which writes two connection strings to `.env`:
   - `DATABASE_URL`: the **pooled** string (host ends in `-pooler`), which the app uses
   - `DATABASE_URL_UNPOOLED`: the **direct** string, which Prisma migrations use
2. **App (Render, free).** Go to **New → Blueprint** and select this repo. When prompted, fill in:
   - `DATABASE_URL` and `DATABASE_URL_UNPOOLED`: the two Neon strings
   - `SEED_ADMIN_EMAIL`
   - `SEED_ADMIN_PASSWORD`

   `AUTH_SECRET` is generated for you. Then click **Apply**.
3. Open `https://<service>.onrender.com/en` and sign in as the super admin.

Free-tier limits:

- **Render:** the app sleeps after about 15 minutes idle and takes 30–60 seconds to wake.
- **Neon:** about 0.5 GB of storage.

To upgrade, change `plan: free` to `plan: starter` in `render.yaml`. No code changes are needed.

The `Dockerfile` also works on Google Cloud Run, Railway or Fly.io with any managed Postgres.

After the first deploy, sign in as the super admin. Under **Administration → Sanghas, sabhas & in-charges**, add the state bodies and appoint their heads. The state heads then appoint district in-charges, who add their local sanghas and sabhas.

### Data to review before launch

- `prisma/data/gotras.ts`: the 102 gotras, transcribed from vaasavi.net. Spellings vary between sources.
- `prisma/data/districts.ts`: Andhra Pradesh and Telangana only. Add the other states from the admin page.
- `messages/te.json`, `messages/kn.json` and `messages/ta.json` need a review by native speakers.

## Contributing

This is a community project. Contribution guidelines will be published as the codebase takes shape.

## License

_To be decided._

---

© Aryavysya Connect · All India Aryavysya Bandhu Mitra Connect (AIAVBMC)
