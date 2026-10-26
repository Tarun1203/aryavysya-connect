// node scripts/gotras/build.js scripts/gotras/master-106.tsv scripts/gotras/vysyamala-102.ts prisma/data/gotras.ts docs/gotra-review.md
// Builds prisma/data/gotras.ts from the 106-row master list (gotras106.tsv) and the earlier Vysyamala
// 102 list, plus a review report. Usage: node gen106.js <tsv> <old gotras.ts> <out gotras.ts> <out report.md>
const fs = require("fs");
const [tsv, oldTs, outTs, outMd] = process.argv.slice(2);

/* ---------- old 102 row -> new row (checked by hand; null = no counterpart, kept unnumbered) ---------- */
const MAP = {
  1: 2, 2: 3, 3: 1, 4: 89, 5: 90, 6: 91, 7: 62, 8: 49, 9: 30, 10: 29, 11: 31, 12: 32, 13: 33, 14: 36, 15: 34, 16: null,
  17: 35, 18: 37, 19: 16, 20: 20, 21: 18, 22: 19, 23: 9, 24: 10, 25: 24, 26: 27, 27: 26, 28: 25, 29: 22, 30: 52,
  31: 28, 32: 84, 33: 87, 34: 88, 35: 85, 36: 11, 37: 15, 38: 13, 39: 12, 40: 47, 41: 48, 42: 53, 43: 51, 44: 54,
  45: 50, 46: 55, 47: 60, 48: 61, 49: 57, 50: 56, 51: 59, 52: 58, 53: 8, 54: 7, 55: 4, 56: 5, 57: 40, 58: 39,
  59: 38, 60: 41, 61: 45, 62: 46, 63: 86, 64: 43, 65: 42, 66: 106, 67: 105, 68: 99, 69: 95, 70: 96, 71: 97, 72: 94,
  73: 98, 74: 100, 75: 93, 76: 102, 77: 103, 78: 101, 79: 92, 80: 104, 81: 69, 82: 63, 83: 74, 84: 78, 85: 77,
  86: 70, 87: 71, 88: 73, 89: 68, 90: 65, 91: 67, 92: 66, 93: 64, 94: 80, 95: 82, 96: 81, 97: null, 98: 79,
  99: null, 100: 72, 101: 76, 102: 21,
};

/* ---------- English -> Telugu for kula names (Telugu words: short e/o, retroflex in -setla / -shishta) ---------- */
const V = { a: ["అ", ""], aa: ["ఆ", "ా"], i: ["ఇ", "ి"], ee: ["ఈ", "ీ"], ii: ["ఈ", "ీ"], u: ["ఉ", "ు"], oo: ["ఊ", "ూ"], uu: ["ఊ", "ూ"],
  e: ["ఎ", "ె"], ae: ["ఏ", "ే"], ai: ["ఐ", "ై"], o: ["ఒ", "ొ"], au: ["ఔ", "ౌ"], RU: ["ఋ", "ృ"] };
const C = { chh: "ఛ", ch: "చ", c: "చ", kh: "ఖ", k: "క", q: "క", gh: "ఘ", g: "గ", jh: "ఝ", j: "జ", z: "జ", th: "త", dh: "ధ", d: "ద",
  t: "త", ph: "ఫ", f: "ఫ", p: "ప", bh: "భ", b: "బ", m: "మ", n: "న", y: "య", r: "ర", l: "ల", v: "వ", w: "వ", sh: "శ", s: "స", h: "హ",
  X: "క్ష", T: "ట", TH: "ఠ", SS: "ష", M: "ం" };
function teluguWord(w) {
  let s = w.toLowerCase();
  s = s.replace(/x/g, "X");
  s = s.replace(/shth/g, "SSTH").replace(/sht/g, "SST").replace(/(?<=[ei])sth/g, "SSTH").replace(/(?<=e)st/g, "SST");
  s = s.replace(/tt(?=l|i)/g, "TT").replace(/t(?=l)/g, "T").replace(/TT/g, "TT");
  s = s.replace(/^([pvbt]|bh|dh)ru/, "$1RU");
  s = s.replace(/(?<=[^aeiou])y(?=[^aeiou])/g, "ai");
  s = s.replace(/ow(?=[^aeiou]|$)|ou/g, "au");
  s = s.replace(/n(?=[kgcjtdpbsh]|ch)/g, "M").replace(/m(?=sh|s|v|h)/g, "M");
  const keysV = Object.keys(V).sort((a, b) => b.length - a.length);
  const keysC = Object.keys(C).sort((a, b) => b.length - a.length);
  let out = "", prevCons = false, i = 0;
  while (i < s.length) {
    const v = keysV.find((k) => s.startsWith(k, i));
    if (v) { out += prevCons ? V[v][1] : V[v][0]; prevCons = false; i += v.length; continue; }
    const c = keysC.find((k) => s.startsWith(k, i));
    if (c) {
      if (c === "M") { out += C.M; prevCons = false; i += 1; continue; }
      if (prevCons) out += "్";
      out += C[c]; prevCons = true; i += c.length; continue;
    }
    out += s[i]; prevCons = false; i++;
  }
  if (prevCons) out += "";
  return out;
}
const telugu = (s) => s.split(" ").map(teluguWord).join(" ");

/* ---------- Telugu -> Kannada (same layout, offset 0x80) ---------- */
const kannada = (s) => [...s].map((ch) => { const c = ch.codePointAt(0); return c >= 0x0c00 && c <= 0x0c7f ? String.fromCodePoint(c + 0x80) : ch; }).join("");

/* ---------- Telugu -> Tamil (Tamil has one letter for each k/c/t/p group; n and anusvara by position) ---------- */
const TC = { క: "க", ఖ: "க", గ: "க", ఘ: "க", ఙ: "ங", చ: "ச", ఛ: "ச", జ: "ஜ", ఝ: "ஜ", ఞ: "ஞ", ట: "ட", ఠ: "ட", డ: "ட", ఢ: "ட", ణ: "ண",
  త: "த", థ: "த", ద: "த", ధ: "த", న: "ன", ప: "ப", ఫ: "ப", బ: "ப", భ: "ப", మ: "ம", య: "ய", ర: "ர", ఱ: "ற", ల: "ல", ళ: "ள", వ: "வ",
  శ: "ஷ", ష: "ஷ", స: "ஸ", హ: "ஹ" };
const TV = { అ: "அ", ఆ: "ஆ", ఇ: "இ", ఈ: "ஈ", ఉ: "உ", ఊ: "ஊ", ఋ: "ரு", ఎ: "எ", ఏ: "ஏ", ఐ: "ஐ", ఒ: "ஒ", ఓ: "ஓ", ఔ: "ஔ" };
const TS = { "ా": "ா", "ి": "ி", "ీ": "ீ", "ు": "ு", "ూ": "ூ", "ృ": "்ரு", "ె": "ெ", "ే": "ே", "ై": "ை", "ొ": "ொ", "ో": "ோ", "ౌ": "ௌ", "్": "்", "ః": "ஃ" };
function tamil(s) {
  const a = [...s];
  let out = "";
  for (let i = 0; i < a.length; i++) {
    const ch = a[i], next = a[i + 1], after = a[i + 2];
    if (ch === "న") {
      const atStart = i === 0 || a[i - 1] === " ";
      out += atStart || (next === "్" && "తథదధ".includes(after)) ? "ந" : "ன";
    } else if (ch === "ం") {
      out += "కఖగఘ".includes(next) ? "ங்" : "చఛజఝ".includes(next) ? "ஞ்" : "టఠడఢ".includes(next) ? "ண்" : "తథదధన".includes(next) ? "ந்" : "ம்";
    } else out += TC[ch] ?? TV[ch] ?? TS[ch] ?? ch;
  }
  return out;
}

/* ---------- merge ---------- */
const ph = (s) => s.toLowerCase().replace(/[^a-z]/g, "").replace(/sh|ss|z/g, "s").replace(/([bcdgjkpt])h/g, "$1").replace(/w/g, "v")
  .replace(/ee|ii|y/g, "i").replace(/oo|uu/g, "u").replace(/aa/g, "a").replace(/ow|ou/g, "au").replace(/(.)\1+/g, "$1").replace(/(kula|kulu|kul|gula)$/, "").replace(/a$/, "");
const rows = fs.readFileSync(tsv, "utf8").trim().split(/\r?\n/).map((l) => { const [no, name, te, k] = l.split("|"); return { no: +no, name, te, fileKulas: k ? k.split(";") : [] }; });
const src = fs.readFileSync(oldTs, "utf8");
const old = eval("[" + src.slice(src.indexOf("= [") + 3, src.lastIndexOf("];")) + "]");

// Each gotra (new rows + old rows with no counterpart) and the kula names claimed for it, by source
const gotras = rows.map((r) => ({ key: "n" + r.no, no: r.no, name: r.name, te: r.te, file: r.fileKulas, vys: [], legacy: [] }));
const extras = [];
for (const o of old) {
  const to = MAP[o.no];
  if (to === undefined) throw new Error("unmapped old " + o.no);
  if (to === null) extras.push({ key: "o" + o.no, no: null, name: o.name, te: telugu(o.name).replace(/ె/g, "ే").replace(/ొ/g, "ో"), file: [], vys: o.kulas, legacy: [], oldNo: o.no });
  else { const g = gotras.find((x) => x.no === to); g.vys.push(...o.kulas); g.legacy.push(o.name); }
}
const all = [...gotras, ...extras];
const claims = new Map(); // phonetic kula -> Set(gotra key)
const vysOwner = new Map(); // phonetic kula -> Set(gotra key) from the Vysyamala list
for (const g of all) {
  for (const k of g.file) (claims.get(ph(k)) ?? claims.set(ph(k), new Set()).get(ph(k))).add(g.key);
  for (const k of g.vys) {
    (claims.get(ph(k)) ?? claims.set(ph(k), new Set()).get(ph(k))).add(g.key);
    (vysOwner.get(ph(k)) ?? vysOwner.set(ph(k), new Set()).get(ph(k))).add(g.key);
  }
}
const conflicts = [];
const allowed = (k, g) => {
  const who = claims.get(ph(k));
  if (who.size === 1) return true;
  const vo = vysOwner.get(ph(k));
  return !!vo && vo.size === 1 && vo.has(g.key);
};
for (const [p, who] of claims) {
  if (who.size < 2) continue;
  const vo = vysOwner.get(p);
  const names = [...who].map((key) => all.find((g) => g.key === key)).map((g) => (g.no ? `${g.no} ${g.name}` : `${g.name} (old #${g.oldNo})`));
  const sample = all.flatMap((g) => [...g.file, ...g.vys]).find((k) => ph(k) === p);
  const keptAt = vo && vo.size === 1 ? all.find((g) => g.key === [...vo][0]) : null;
  conflicts.push(`| ${sample} | ${names.join("; ")} | ${keptAt ? `kept only at ${keptAt.no ?? ""} ${keptAt.name} (the earlier Vysyamala list puts it there)` : "dropped everywhere until confirmed"} |`);
}
const dropped = [];
for (const g of all) {
  const seen = new Set();
  g.kulas = [];
  for (const k of [...g.file, ...g.vys]) {
    if (seen.has(ph(k))) continue;
    seen.add(ph(k));
    if (allowed(k, g)) g.kulas.push(k);
    else dropped.push(`${k} (${g.no ?? ""} ${g.name})`);
  }
}

/* ---------- output ---------- */
const esc = JSON.stringify;
const entry = (g) => {
  const kulaNames = Object.fromEntries(g.kulas.map((k) => { const te = telugu(k); return [k, { te, kn: kannada(te), ta: tamil(te) }]; }));
  return `  { no: ${g.no ?? "null"}, name: ${esc(g.name)}, nameTe: ${esc(g.te)}, nameKn: ${esc(kannada(g.te))}, nameTa: ${esc(tamil(g.te))},
    kulas: ${esc(g.kulas)},
    kulaNames: ${esc(kulaNames)} },`;
};
const renames = Object.fromEntries(gotras.flatMap((g) => g.legacy.filter((n) => n !== g.name).map((n) => [n, g.name])));
fs.writeFileSync(outTs, `// The master list of Arya Vysya gotras (rishi) with their sankethanamas (kula names), in English,
// Telugu, Kannada and Tamil – 106 rows as supplied by the project owner.
//  - Gotra names in Telugu were written by hand; kula names were transliterated by rule. Kannada is
//    converted letter for letter from the Telugu; Tamil with Tamil's own letter rules. All of these
//    are approximate and stay marked "unverified" until a native speaker checks them in /admin/gotras.
//  - Kula names are this list's plus the earlier Vysyamala list's, except names claimed by two
//    gotras (copy errors in the source) – see docs/gotra-review.md.
//  - Rows with no: null are gotras from the earlier list with no counterpart here, kept so the
//    people recorded with them keep their gotra.
// Regenerate with scripts/gotras/build.js rather than editing by hand.
export type GotraSeed = {
  no: number | null;
  name: string;
  nameTe: string;
  nameKn: string;
  nameTa: string;
  kulas: string[];
  kulaNames: Record<string, { te: string; kn: string; ta: string }>;
};

export const GOTRAS: GotraSeed[] = [
${[...gotras, ...extras].map(entry).join("\n")}
];

/** Earlier names, renamed in place so the people recorded with them keep their gotra. */
export const RENAMED_GOTRAS: Record<string, string> = ${JSON.stringify({ Gruthsan: "Grutsnamadasa", ...renames }, null, 2)};
`);

const mapped = old.filter((o) => MAP[o.no] !== null).map((o) => { const g = gotras.find((x) => x.no === MAP[o.no]); return `| ${o.no} ${o.name} | ${g.no} ${g.name} |`; });
fs.writeFileSync(outMd, `# Gotra list – review notes

The gotra master list was replaced with the 106-row list in four languages (\`prisma/data/gotras.ts\`).
Everything below needs a check by the state Mahasabhas and native speakers.

## Scripts
- Telugu gotra names were written by hand from the English, correcting the machine transliteration
  (for example కౌశికస not కౌసికస, భారద్వాజస not భారద్వజస).
- Kula names were transliterated by rule: short e/o for Telugu words, ట్ల in -setla, ష్ట / ష్ఠ in
  -shishta / -shrestha, ృ in Pr-/Vr-/Bhr-. Dental vs retroflex (త/ట, ద/డ) cannot be told from the
  English, so names like Gunta / Konda may need ట / డ.
- Kannada is converted letter for letter from the Telugu. Tamil uses Tamil letters: one letter per
  k/c/t/p group, ந/ன by position. All are marked unverified in the Gotras tab until checked.

## Rows with no counterpart
New rows not in the earlier list (added):
${gotras.filter((g) => !g.legacy.length).map((g) => `- ${g.no} ${g.name}${g.file.length ? "" : " – no kula names"}`).join("\n")}

Earlier gotras with no row in the new list (kept, unnumbered):
${extras.map((g) => `- ${g.name} (old #${g.oldNo}) – kulas: ${g.vys.join(", ")}`).join("\n")}

Notes: #6 Bheemasreshtakula looks like a kula name (it is also listed under 97 Vashishtasa);
83 Taitreyasa and 85 Thaithreyasa may be one gotra; 15 Doorvasana is probably Durvasasa.

## Kula names claimed by more than one gotra
| Kula | Gotras | What happened |
|---|---|---|
${conflicts.join("\n")}

## Earlier name → new row
| Earlier list | New list |
|---|---|
${mapped.join("\n")}
`);
console.log(`gotras: ${gotras.length} + ${extras.length} kept; kulas: ${all.reduce((n, g) => n + g.kulas.length, 0)}; conflicts: ${conflicts.length}; dropped: ${dropped.length}`);
console.log("sample:", ["Arasishtakula", "Balishistha", "Pruthvisetla", "Polisetti", "Pydikula", "Mytrikula", "Pendlikula", "Kondakula", "Powtsakula", "Ganamuku Kula"].map((k) => { const te = telugu(k); return `${k}=${te}/${kannada(te)}/${tamil(te)}`; }).join("\n"));
console.log("rishi ta:", rows.slice(0, 12).map((r) => tamil(r.te)).join(" "));
