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

## Getting started

_Setup instructions will be added once the stack is finalized._

```bash
# placeholder
git clone https://github.com/<org>/aryavysya-connect.git
cd aryavysya-connect
# install & run steps to follow
```

## Contributing

This is a community project. Contribution guidelines will be published as the codebase takes shape.

## License

_To be decided._

---

© Aryavysya Connect · All India Aryavysya Bandhu Mitra Connect (AIAVBMC)
