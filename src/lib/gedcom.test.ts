import { test } from "node:test";
import assert from "node:assert/strict";
import { familiesFrom, fromGedDate, generations, parseNodes, planImport, readGedcom, toGedDate, writeGedcom, type GedPerson } from "./gedcom";

const NOW = new Date("2026-10-28T00:00:00Z");

test("dates both ways", () => {
  assert.equal(toGedDate("1952-03-14"), "14 MAR 1952");
  assert.equal(toGedDate("1952-03"), "MAR 1952");
  assert.equal(toGedDate("1952"), "1952");
  assert.equal(toGedDate("around 1950"), null);
  assert.deepEqual(fromGedDate("14 MAR 1952"), { date: "1952-03-14", approx: false });
  assert.deepEqual(fromGedDate("mar 1952"), { date: "1952-03", approx: false });
  assert.deepEqual(fromGedDate("1952"), { date: "1952", approx: false });
  assert.deepEqual(fromGedDate("ABT 1890"), { date: "1890", approx: true });
  assert.deepEqual(fromGedDate("BET 1890 AND 1895"), { date: "1890", approx: true });
  assert.deepEqual(fromGedDate("@#DGREGORIAN@ 2 JAN 1901"), { date: "1901-01-02", approx: false });
  assert.deepEqual(fromGedDate("@#DHEBREW@ 1 TSH 5700"), { date: null, approx: true });
  assert.deepEqual(fromGedDate("sometime"), { date: null, approx: true });
  assert.deepEqual(fromGedDate(""), { date: null, approx: false });
});

test("lines: levels, CONC/CONT, @@ and a BOM", () => {
  const { roots, problems } = parseNodes("﻿0 HEAD\r\n0 @N1@ NOTE first\r\n1 CONC  half\r\n1 CONT second line\r\n1 _X a@@b\r\nrubbish\r\n0 TRLR");
  assert.equal(roots[1].value, "first half\nsecond line");
  assert.equal(roots[1].children[0].value, "a@b");
  assert.equal(problems.length, 1);
});

const SAMPLE = `0 HEAD
1 GEDC
2 VERS 5.5.1
1 CHAR UTF-8
0 @I1@ INDI
1 NAME Venkata Ramaiah /Kotha/
1 NAME వెంకట రామయ్య /కోట/
1 SEX M
1 BIRT
2 DATE ABT 1890
2 PLAC Guntur
1 DEAT
2 DATE 1960
1 _GOTRA Kasyapasa
1 FAMS @F1@
0 @I2@ INDI
1 NAME Lakshmamma /Kotha/
1 SEX F
1 DEAT Y
1 FAMS @F1@
0 @I3@ INDI
1 NAME Ravi /Kotha/
1 SEX M
1 BIRT
2 DATE 14 MAR 1952
1 OCCU Teacher
1 FAMC @F1@
0 @I4@ INDI
1 NAME /Kotha/
1 SEX U
1 BIRT
2 DATE 1900
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 MARR
2 DATE 1925
1 CHIL @I3@
1 CHIL @I9@
0 @S1@ SOUR
1 TITL Family bible
0 TRLR
`;

test("reading a typical file", () => {
  const r = readGedcom(SAMPLE, NOW);
  assert.equal(r.people.length, 4);
  const [a, b, c, d] = r.people;
  assert.equal(a.givenName, "Venkata Ramaiah");
  assert.equal(a.surname, "Kotha");
  assert.equal(a.givenNameLocal, "వెంకట రామయ్య");
  assert.equal(a.surnameLocal, "కోట");
  assert.equal(a.birthDate, "1890");
  assert.equal(a.birthPlace, "Guntur");
  assert.equal(a.isLiving, false);
  assert.equal(a.gotra, "Kasyapasa");
  assert.equal(a.birthGotra, "Kasyapasa", "a husband's own gotra is his birth gotra");
  assert.equal(b.isLiving, false, "1 DEAT Y means passed away");
  assert.equal(c.birthDate, "1952-03-14");
  assert.equal(c.isLiving, true);
  assert.equal(c.occupation, "Teacher");
  assert.equal(d.givenName, "?");
  assert.equal(d.gender, "OTHER");
  assert.equal(d.isLiving, false, "born 1900, no death: presumed passed");
  assert.deepEqual(r.skipped, { SOUR: 1 });
  assert.equal(r.families[0].marriageDate, "1925");
  assert.ok(r.warnings.some((w) => w.includes("ABT 1890")));
});

test("refusing files we can't read correctly", () => {
  assert.throws(() => readGedcom("0 INDI\n"), /not a GEDCOM file/);
  assert.throws(() => readGedcom("0 HEAD\n1 CHAR ANSEL\n0 TRLR"), /UTF-8/);
});

const person = (ref: string, gender: GedPerson["gender"] = "MALE"): GedPerson => ({ ref, givenName: ref, surname: "S", gender, isLiving: true });

test("plan: missing people, a third parent, loops and parent–spouse are left out", () => {
  const plan = planImport({
    people: ["A", "B", "C", "D", "E"].map((r) => person(r)),
    families: [
      { ref: "F1", husband: "A", wife: "B", children: ["C", "Z"], married: true },
      { ref: "F2", husband: "D", children: ["C"] }, // a third parent for C
      { ref: "F3", husband: "C", children: ["A"] }, // A would be his own grandchild
      { ref: "F4", husband: "D", wife: "E", children: ["E"] }, // E the child and wife of D
    ],
  });
  assert.deepEqual(plan.parentLinks, [
    { parent: "A", child: "C" },
    { parent: "B", child: "C" },
  ]);
  assert.equal(plan.couples.length, 2);
  for (const bit of ["Z", "more than two parents", "own ancestor", "spouse of their parent"]) assert.ok(plan.warnings.some((w) => w.includes(bit)), bit);
});

test("write then read gives the same people and links back", () => {
  const people: GedPerson[] = [
    { ...person("@I1@"), givenName: "Venkata Ramaiah", surname: "Kotha", givenNameLocal: "వెంకట", surnameLocal: "కోట", birthDate: "1890", isLiving: false, deathDate: "1960-05", gotra: "Kasyapasa", birthGotra: "Kasyapasa", maternalGotra: "Vashishtasa", nakshatra: "Rohini", rasi: "Vrishabha", kuladevata: "Vasavi Kanyaka Parameswari", birthPlace: "Guntur" },
    { ...person("@I2@", "FEMALE"), givenName: "Lakshmamma", surname: "Kotha", isLiving: false },
    { ...person("@I3@"), givenName: "Ravi", surname: "Kotha", birthDate: "1952-03-14", occupation: "Teacher\nand writer – " + "x".repeat(300) },
    { ...person("@I4@", "FEMALE"), private: true, givenName: "Private", surname: "" },
  ];
  const families = familiesFrom(
    people,
    [{ a: "@I2@", b: "@I1@", marriageDate: "1925" }],
    [
      { parent: "@I1@", child: "@I3@" },
      { parent: "@I2@", child: "@I3@" },
      { parent: "@I3@", child: "@I4@" },
    ],
  );
  assert.equal(families[0].husband, "@I1@", "the man goes in the husband slot");
  const text = writeGedcom({ people, families }, { source: "TEST", version: "1", date: NOW });
  assert.ok(text.split("\r\n").every((l) => l.length <= 255));
  assert.ok(!text.includes("Private /Private"));
  const lines = text.split(/\r\n/);
  assert.ok(lines.includes("1 HUSB @I1@") && lines.includes("1 FAMS @F1@") && !text.includes("@@"), "pointers are not escaped");
  const back = readGedcom(text, NOW);
  for (const k of ["givenName", "surname", "givenNameLocal", "surnameLocal", "birthDate", "deathDate", "isLiving", "gotra", "birthGotra", "maternalGotra", "nakshatra", "rasi", "kuladevata", "birthPlace", "occupation"] as const) {
    assert.deepEqual(back.people[0][k] ?? null, people[0][k] ?? null, k);
  }
  assert.equal(back.people[2].occupation, people[2].occupation);
  assert.equal(back.people[3].givenName, "Private");
  assert.equal(back.people[3].birthDate, null);
  const plan = planImport(back);
  assert.equal(plan.parentLinks.length, 3);
  assert.equal(plan.couples.length, 1);
  assert.equal(plan.couples[0].marriageDate, "1925");
  assert.deepEqual(plan.warnings, []);
});

test("generations: parents before their children", () => {
  const people = ["K", "P", "M", "G"].map((r) => person(r));
  const layers = generations({ people, parentLinks: [{ parent: "P", child: "K" }, { parent: "M", child: "K" }, { parent: "G", child: "P" }] });
  assert.deepEqual(layers, [["M", "G"], ["P"], ["K"]]);
});

test("community facts: a wife's own gotra is not her birth gotra; lists are checked", () => {
  const r = readGedcom(
    ["0 HEAD", "1 CHAR UTF-8", "0 @I1@ INDI", "1 NAME A /B/", "1 SEX M", "1 _GOTRA Kasyapasa", "0 @I2@ INDI", "1 NAME C /B/", "1 SEX F",
     "1 _GOTRA Kasyapasa", "1 _NAKSHATRA rohini", "1 _RASI Unknownsign", "0 @F1@ FAM", "1 HUSB @I1@", "1 WIFE @I2@", "0 TRLR"].join("\n"),
    NOW,
  );
  const wife = r.people[1];
  assert.equal(wife.gotra, "Kasyapasa");
  assert.equal(wife.birthGotra, null);
  assert.equal(wife.nakshatra, "Rohini");
  assert.equal(wife.rasi, null);
  assert.ok(r.warnings.some((w) => w.includes("Unknownsign")));
});
