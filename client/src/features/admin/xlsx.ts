/**
 * Minimal .xlsx reader: enough to turn the counselor's shift spreadsheet into a
 * table of strings without pulling in a spreadsheet library. An .xlsx is a ZIP
 * of XML parts, and both are things the browser can already do — the ZIP central
 * directory is walked by hand and entries are inflated with DecompressionStream.
 *
 * Only the first worksheet is read; formulas are taken as their cached value.
 */

const EOCD_SIG = 0x06054b50;
const CENTRAL_SIG = 0x02014b50;

interface ZipEntry {
  name: string;
  offset: number;
  compression: number;
  compressedSize: number;
}

function readCentralDirectory(view: DataView): ZipEntry[] {
  // The end-of-central-directory record sits in the last 64 KB (comment aside).
  let eocd = -1;
  for (let i = view.byteLength - 22; i >= 0 && i > view.byteLength - 65558; i--) {
    if (view.getUint32(i, true) === EOCD_SIG) { eocd = i; break; }
  }
  if (eocd === -1) throw new Error('Файл не похож на .xlsx (не ZIP-архив)');

  const count = view.getUint16(eocd + 10, true);
  let ptr = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder();
  const entries: ZipEntry[] = [];
  for (let i = 0; i < count; i++) {
    if (view.getUint32(ptr, true) !== CENTRAL_SIG) break;
    const nameLen = view.getUint16(ptr + 28, true);
    const extraLen = view.getUint16(ptr + 30, true);
    const commentLen = view.getUint16(ptr + 32, true);
    entries.push({
      name: decoder.decode(new Uint8Array(view.buffer, ptr + 46, nameLen)),
      compression: view.getUint16(ptr + 10, true),
      compressedSize: view.getUint32(ptr + 20, true),
      offset: view.getUint32(ptr + 42, true),
    });
    ptr += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

async function readEntry(buffer: ArrayBuffer, view: DataView, entry: ZipEntry): Promise<string> {
  // The local header repeats the name/extra lengths; payload starts after them.
  const nameLen = view.getUint16(entry.offset + 26, true);
  const extraLen = view.getUint16(entry.offset + 28, true);
  const start = entry.offset + 30 + nameLen + extraLen;
  const raw = new Uint8Array(buffer, start, entry.compressedSize);
  if (entry.compression === 0) return new TextDecoder().decode(raw);
  if (entry.compression !== 8) throw new Error('Неподдерживаемое сжатие в .xlsx');
  const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Response(stream).text();
}

/** "BC12" → 27 (0-based column index). */
function columnIndex(ref: string): number {
  let n = 0;
  for (const ch of ref) {
    const code = ch.charCodeAt(0);
    if (code < 65 || code > 90) break;
    n = n * 26 + (code - 64);
  }
  return n - 1;
}

function textOf(node: Element | null): string {
  return node?.textContent ?? '';
}

function parseSharedStrings(xml: string | null): string[] {
  if (!xml) return [];
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  return Array.from(doc.getElementsByTagName('si')).map((si) =>
    Array.from(si.getElementsByTagName('t')).map((t) => t.textContent ?? '').join(''),
  );
}

function parseSheet(xml: string, shared: string[]): string[][] {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const rows: string[][] = [];
  for (const row of Array.from(doc.getElementsByTagName('row'))) {
    const cells: string[] = [];
    for (const c of Array.from(row.getElementsByTagName('c'))) {
      const at = columnIndex(c.getAttribute('r') ?? '');
      const type = c.getAttribute('t');
      let value: string;
      if (type === 's') {
        value = shared[Number(textOf(c.querySelector('v')))] ?? '';
      } else if (type === 'inlineStr') {
        value = Array.from(c.getElementsByTagName('t')).map((t) => t.textContent ?? '').join('');
      } else {
        value = textOf(c.querySelector('v'));
      }
      const index = at >= 0 ? at : cells.length;
      while (cells.length < index) cells.push('');
      cells[index] = value;
    }
    rows.push(cells);
  }
  return rows.filter((r) => r.some((cell) => cell.trim().length > 0));
}

/** Read the first worksheet of an .xlsx file as rows of raw cell text. */
export async function readXlsx(file: File | Blob): Promise<string[][]> {
  const buffer = await file.arrayBuffer();
  const view = new DataView(buffer);
  const entries = readCentralDirectory(view);

  const sheets = entries
    .filter((e) => /^xl\/worksheets\/sheet\d*\.xml$/.test(e.name))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  if (sheets.length === 0) throw new Error('В .xlsx не найден лист');

  const sharedEntry = entries.find((e) => e.name === 'xl/sharedStrings.xml');
  const [sheetXml, sharedXml] = await Promise.all([
    readEntry(buffer, view, sheets[0]),
    sharedEntry ? readEntry(buffer, view, sharedEntry) : Promise.resolve(null),
  ]);
  return parseSheet(sheetXml, parseSharedStrings(sharedXml));
}

/** Join a table into the tab-separated text the import endpoint parses. */
export function toTsv(rows: string[][]): string {
  return rows
    .map((row) =>
      row
        .map((cell) => (/["\t\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell))
        .join('\t'),
    )
    .join('\n');
}
