// Sanity check for the edit-scope and marriage-match rules against the demo family.
import "dotenv/config";
import { db } from "../src/lib/db";
import { familyScope, checkMatch } from "../src/lib/family";

async function main() {
  const user = await db.user.findUniqueOrThrow({ where: { email: "srinivas@example.com" } });
  const scope = await familyScope(user.personId!);
  const people = await db.person.findMany();
  for (const p of people.sort((a, b) => a.birthDate!.localeCompare(b.birthDate!))) {
    const s = scope.get(p.id);
    console.log(`${p.birthDate} ${p.givenName.padEnd(18)} ${s ? `EDITABLE gen=${s.gen} ${s.kind}` : "read-only"}`);
  }
  const byName = (n: string) => people.find((p) => p.givenName === n)!.id;
  for (const [a, b] of [["Ravi Kumar", "Anjali"], ["Vasavi", "Ravi Kumar"], ["Ravi Kumar", "Lakshmi"]]) {
    const r = await checkMatch(byName(a), byName(b));
    console.log(a, "x", b, "=>", r.verdict, r.sameGotra ? "SAGOTRA" : "", r.common ? `common=${r.common.name} (${r.common.genA},${r.common.genB}) ${r.cousinType ?? ""}` : "");
  }
}
main().finally(() => db.$disconnect());
