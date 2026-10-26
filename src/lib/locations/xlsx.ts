// Minimal streaming reader for the first worksheet of an .xlsx file, so very large government
// exports (LGD "All Villages Of India" is ~490 MB of sheet XML) can be imported row by row.
// Handles inline strings, shared strings and numbers; formulas, dates and styles are not needed here.
import { StringDecoder } from "node:string_decoder";
import yauzl, { type Entry, type ZipFile } from "yauzl";

const openZip = (path: string) =>
  new Promise<ZipFile>((resolve, reject) =>
    yauzl.open(path, { lazyEntries: true, autoClose: false }, (err, zip) => (err ? reject(err) : resolve(zip!)))
  );

async function entries(zip: ZipFile) {
  const list: Entry[] = [];
  await new Promise<void>((resolve, reject) => {
    zip.on("entry", (e: Entry) => {
      list.push(e);
      zip.readEntry();
    });
    zip.on("end", () => resolve());
    zip.on("error", reject);
    zip.readEntry();
  });
  return list;
}

const stream = (zip: ZipFile, entry: Entry) =>
  new Promise<NodeJS.ReadableStream>((resolve, reject) =>
    zip.openReadStream(entry, (err, s) => (err ? reject(err) : resolve(s!)))
  );

async function readText(zip: ZipFile, entry: Entry) {
  const chunks: Buffer[] = [];
  for await (const chunk of await stream(zip, entry)) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

const decode = (s: string) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, "&");

/** "A" → 0, "O" → 14, "AA" → 26 */
const colIndex = (ref: string) => [...ref.replace(/\d+/g, "")].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;

const texts = (xml: string) => [...xml.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => decode(m[1])).join("");

function parseRow(xml: string, shared: string[]): string[] {
  const cells: string[] = [];
  for (const m of xml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const attrs = m[1];
    const body = m[2] ?? "";
    const ref = attrs.match(/\br="([A-Z]+)\d*"/)?.[1];
    const type = attrs.match(/\bt="([^"]+)"/)?.[1];
    let value = "";
    if (type === "inlineStr") value = texts(body);
    else {
      const v = body.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? "";
      value = type === "s" ? (shared[Number(v)] ?? "") : decode(v);
    }
    // whole numbers are often stored as "603.0"
    if (type === "n" || (!type && /^-?\d+\.0+$/.test(value))) value = value.replace(/\.0+$/, "");
    cells[ref ? colIndex(ref) : cells.length] = value.trim();
  }
  return Array.from(cells, (c) => c ?? "");
}

/**
 * Yield the first worksheet's rows as objects keyed by the header row.
 * The header is the first row with at least three filled cells (LGD files start with a title row).
 */
export async function* xlsxRecords(path: string): AsyncGenerator<Record<string, string>> {
  const zip = await openZip(path);
  try {
    const all = await entries(zip);
    const sheet = all
      .filter((e) => /^xl\/worksheets\/sheet\d+\.xml$/.test(e.fileName))
      .sort((a, b) => a.fileName.localeCompare(b.fileName, undefined, { numeric: true }))[0];
    if (!sheet) throw new Error("No worksheet found in the Excel file");
    const sst = all.find((e) => e.fileName === "xl/sharedStrings.xml");
    const shared = sst && sst.uncompressedSize > 0
      ? [...(await readText(zip, sst)).matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => texts(m[1]))
      : [];

    let headers: string[] | null = null;
    let buf = "";
    // keeps multi-byte characters (Telugu, Tamil …) intact across chunk boundaries
    const utf8 = new StringDecoder("utf8");
    for await (const chunk of await stream(zip, sheet)) {
      buf += utf8.write(chunk as Buffer);
      let end: number;
      while ((end = buf.indexOf("</row>")) !== -1) {
        const start = buf.lastIndexOf("<row", end);
        const rowXml = buf.slice(start, end);
        buf = buf.slice(end + 6);
        const cells = parseRow(rowXml, shared);
        if (!headers) {
          if (cells.filter(Boolean).length >= 3) headers = cells;
          continue;
        }
        if (!cells.some(Boolean)) continue;
        yield Object.fromEntries(headers.map((h, i) => [h, cells[i] ?? ""]));
      }
    }
  } finally {
    zip.close();
  }
}
