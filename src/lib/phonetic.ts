/** Collapse common Telugu/Kannada/Tamil transliteration variants: Srinivasa / Sreenivas / Shrinivaasa. */
export function phonetic(s: string) {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z]/g, "")
    .replace(/x/g, "ks")
    .replace(/sh|ss|z/g, "s")
    .replace(/([bcdgjkpt])h/g, "$1")
    .replace(/w/g, "v")
    .replace(/ee|ii|y(?=[^aeiou]|$)/g, "i")
    .replace(/oo|uu/g, "u")
    .replace(/aa/g, "a")
    .replace(/(.)\1+/g, "$1")
    .replace(/a$/, "");
}

/** Edit distance, cut short at 3 when the lengths differ by more than two */
export function distance(a: string, b: string) {
  if (Math.abs(a.length - b.length) > 2) return 3;
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length];
}
