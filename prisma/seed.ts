import "dotenv/config";
import bcrypt from "bcryptjs";
import { db } from "../src/lib/db";
import { GOTRAS, RENAMED_GOTRAS } from "./data/gotras";
import { DISTRICTS } from "./data/districts";

/** Move everything that points at gotra `fromId` to `toId` (when an old name and its new name both exist). */
async function mergeGotra(fromId: string, toId: string) {
  await db.$transaction([
    db.person.updateMany({ where: { gotraId: fromId }, data: { gotraId: toId } }),
    db.person.updateMany({ where: { birthGotraId: fromId }, data: { birthGotraId: toId } }),
    db.person.updateMany({ where: { maternalGotraId: fromId }, data: { maternalGotraId: toId } }),
    db.familyClaim.updateMany({ where: { gotraId: fromId }, data: { gotraId: toId } }),
    db.gotra.delete({ where: { id: fromId } }),
  ]);
}

async function seedGotras() {
  for (const [from, to] of Object.entries(RENAMED_GOTRAS)) {
    const [old, target] = await Promise.all([db.gotra.findUnique({ where: { name: from } }), db.gotra.findUnique({ where: { name: to } })]);
    if (old && target) await mergeGotra(old.id, target.id);
    else if (old) await db.gotra.update({ where: { name: from }, data: { name: to } });
  }
  // The master list is applied in full once (numbers, scripts, kula names); after that the rows
  // belong to the super admins' edits and only missing gotras are added.
  const first = GOTRAS[0];
  const mastered = (await db.gotra.findUnique({ where: { name: first.name } }))?.no === first.no;
  if (!mastered) await db.gotra.updateMany({ data: { no: null } }); // free the numbers before renumbering
  const existing = new Set((await db.gotra.findMany({ select: { name: true } })).map((g) => g.name));
  for (const g of GOTRAS) {
    const data = { no: g.no, nameTe: g.nameTe, nameKn: g.nameKn, nameTa: g.nameTa, kulas: g.kulas, kulaNames: g.kulaNames, localVerified: false };
    if (!mastered) await db.gotra.upsert({ where: { name: g.name }, update: data, create: { name: g.name, ...data } });
    else if (!existing.has(g.name)) await db.gotra.create({ data: { name: g.name, ...data } });
  }
}

async function seedReferenceData() {
  await seedGotras();
  // Once the official LGD directory is loaded it owns the districts (and may have renamed or merged
  // the starter ones), so re-adding the starter list on every start would create duplicates.
  if (await db.district.count({ where: { lgdCode: { not: null } } })) {
    console.log(`Seeded ${GOTRAS.length} gotras (districts come from the LGD directory)`);
    return;
  }
  for (const [state, names] of Object.entries(DISTRICTS)) {
    for (const name of names) {
      await db.district.upsert({ where: { state_name: { state, name } }, update: {}, create: { state, name } });
    }
  }
  console.log(`Seeded ${GOTRAS.length} gotras and ${Object.values(DISTRICTS).flat().length} districts`);
}

async function seedSuperAdmin() {
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !password) return console.log("SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD not set – skipping super admin");
  await db.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      name: "Platform Super Admin",
      passwordHash: await bcrypt.hash(password, 10),
      role: "SUPER_ADMIN",
      status: "APPROVED",
    },
  });
  console.log(`Super admin: ${email}`);
}

/** Demo family spanning 8 generations, for trying the 5-generation edit rule. */
async function seedDemo() {
  const password = process.env.SEED_DEMO_PASSWORD;
  if (!password) return console.log("SEED_DEMO_PASSWORD not set – skipping demo data");
  if (await db.person.count()) return console.log("Tree not empty – skipping demo data");

  const guntur = await db.district.findFirstOrThrow({ where: { name: "Guntur" } });
  const gotra = (name: string) => db.gotra.findUniqueOrThrow({ where: { name } }).then((g) => g.id);
  const kousika = await gotra("Kousikasa");
  const bharadwaja = await gotra("Bharadhvajasa");
  const vasishta = await gotra("Vashishtasa");

  const person = (givenName: string, gender: "MALE" | "FEMALE", gotraId: string, birthDate: string, isLiving = true) =>
    db.person.create({
      data: {
        givenName, surname: "Kotha", gender, gotraId, birthDate, isLiving,
        nativePlace: "Tenali", districtId: guntur.id,
      },
    });
  const marry = (a: string, b: string) => db.couple.create({ data: { person1Id: a, person2Id: b } });
  const child = (parentIds: string[], childId: string) =>
    Promise.all(parentIds.map((parentId) => db.parentChild.create({ data: { parentId, childId } })));

  // Paternal line, generation 7 (oldest) down to 0 (the demo member) and two descendants
  const line = [
    ["Venkata Subbaiah", "1820"], ["Ramaiah", "1848"], ["Narasimham", "1875"], ["Seetharamaiah", "1902"],
    ["Venkateswarlu", "1930"], ["Subba Rao", "1955"], ["Srinivas", "1980"], ["Ravi Kumar", "1992"],
  ];
  const males = [];
  for (const [name, year] of line) males.push(await person(name, "MALE", kousika, year, Number(year) > 1950));
  for (let i = 1; i < males.length; i++) await child([males[i - 1].id], males[i].id);

  const wife = await person("Lakshmi", "FEMALE", bharadwaja, "1983");
  await marry(males[6].id, wife.id);
  await child([wife.id], males[7].id);
  const daughter = await person("Vasavi", "FEMALE", kousika, "1995");
  await child([males[6].id, wife.id], daughter.id);

  // A cousin branch with a different gotra, for the match checker
  const aunt = await person("Padmavathi", "FEMALE", kousika, "1958");
  await child([males[4].id], aunt.id);
  const auntHusband = await db.person.create({
    data: { givenName: "Prasad", surname: "Gupta", gender: "MALE", gotraId: vasishta, birthDate: "1954", districtId: guntur.id },
  });
  await marry(auntHusband.id, aunt.id);
  const cousin = await db.person.create({
    data: { givenName: "Anjali", surname: "Gupta", gender: "FEMALE", gotraId: vasishta, birthDate: "1985", districtId: guntur.id },
  });
  await child([auntHusband.id, aunt.id], cousin.id);

  // Demo community bodies: national → state → local sangha (names are placeholders)
  const national = await db.organization.create({
    data: { name: "Demo Akhila Bharatha Arya Vysya Sangham", level: "NATIONAL", kind: "Akhila Bharatha Sangham" },
  });
  const stateBody = await db.organization.create({
    data: { name: "Demo Andhra Pradesh Arya Vysya Mahasabha", level: "STATE", kind: "Mahasabha", state: "Andhra Pradesh", parentId: national.id },
  });
  const tenali = await db.organization.create({
    data: {
      name: "Demo Tenali Arya Vysya Sangham", level: "LOCAL", kind: "Sangham", state: "Andhra Pradesh",
      districtId: guntur.id, town: "Tenali", parentId: stateBody.id,
    },
  });

  const hash = await bcrypt.hash(password, 10);
  const demoUser = (email: string, name: string, extra: object) =>
    db.user.create({ data: { email, name, passwordHash: hash, status: "APPROVED", districtId: guntur.id, approvedAt: new Date(), ...extra } });

  await demoUser("state.head@example.com", "AP Mahasabha State Head", { role: "STATE_ADMIN", adminOrgId: stateBody.id });
  const incharge = await demoUser("guntur.incharge@example.com", "Guntur District In-charge", { role: "DISTRICT_INCHARGE" });
  await db.district.update({ where: { id: guntur.id }, data: { inchargeId: incharge.id } });
  await demoUser("tenali.sangham@example.com", "Tenali Sangham Secretary", { role: "LOCAL_ADMIN", adminOrgId: tenali.id, organizationId: tenali.id });
  await demoUser("srinivas@example.com", "Srinivas Kotha", { personId: males[6].id, organizationId: tenali.id });

  const pending = await db.user.create({
    data: { email: "ravi@example.com", name: "Ravi Kumar Kotha", passwordHash: hash, districtId: guntur.id, organizationId: tenali.id },
  });
  await db.familyClaim.create({
    data: {
      userId: pending.id, districtId: guntur.id, organizationId: tenali.id, personId: males[7].id, givenName: "Ravi Kumar",
      surname: "Kotha", gender: "MALE", fatherName: "Srinivas Kotha", birthYear: 1992, nativePlace: "Tenali", gotraId: kousika,
    },
  });
  console.log("Demo family, community bodies, admins and members created (password = SEED_DEMO_PASSWORD)");
}

async function main() {
  await seedReferenceData();
  await seedSuperAdmin();
  await seedDemo();
}

main().finally(() => db.$disconnect());
