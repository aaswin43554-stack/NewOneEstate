/**
 * Minimal pure-JS .xlsx writer (no dependencies).
 * Produces a valid Office Open XML workbook with one sheet.
 * Supports strings, numbers and dates.
 *
 * Usage:
 *   import { downloadXlsx } from '../../lib/xlsx';
 *   downloadXlsx(headers, rows, 'my-file');
 *
 * headers : string[]
 * rows     : (string | number | null | undefined)[][]
 * filename : string  (without extension)
 */

/* ── tiny ZIP implementation ─────────────────────────────────────────────── */

function crc32(buf) {
  let crc = 0xffffffff;
  const table = crc32.table || (crc32.table = (() => {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[i] = c;
    }
    return t;
  })());
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function strToBytes(s) {
  return new TextEncoder().encode(s);
}

function u32le(n) {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n, true);
  return b;
}
function u16le(n) {
  const b = new Uint8Array(2);
  new DataView(b.buffer).setUint16(0, n, true);
  return b;
}

function concat(...arrays) {
  const total = arrays.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(total);
  let pos = 0;
  for (const a of arrays) { out.set(a, pos); pos += a.length; }
  return out;
}

/** Build a ZIP archive from an array of { name, data } entries (uncompressed). */
function buildZip(files) {
  const locals = [];
  const centralHeaders = [];
  let offset = 0;

  for (const { name, data } of files) {
    const nameBytes = strToBytes(name);
    const crc = crc32(data);
    const local = concat(
      new Uint8Array([0x50, 0x4b, 0x03, 0x04]), // local file header sig
      u16le(20),          // version needed
      u16le(0),           // general flags
      u16le(0),           // compression: stored
      u16le(0), u16le(0), // mod time / date
      u32le(crc),
      u32le(data.length), // compressed size
      u32le(data.length), // uncompressed size
      u16le(nameBytes.length),
      u16le(0),           // extra field length
      nameBytes,
      data
    );
    locals.push(local);

    centralHeaders.push(concat(
      new Uint8Array([0x50, 0x4b, 0x01, 0x02]),
      u16le(20), u16le(20), u16le(0), u16le(0),
      u16le(0), u16le(0),
      u32le(crc),
      u32le(data.length), u32le(data.length),
      u16le(nameBytes.length),
      u16le(0), u16le(0), u16le(0), u16le(0),
      u32le(0),
      u32le(offset),
      nameBytes
    ));

    offset += local.length;
  }

  const centralStart = offset;
  const centralData = concat(...centralHeaders);
  const eocd = concat(
    new Uint8Array([0x50, 0x4b, 0x05, 0x06]),
    u16le(0), u16le(0),
    u16le(files.length), u16le(files.length),
    u32le(centralData.length),
    u32le(centralStart),
    u16le(0)
  );

  return concat(...locals, centralData, eocd);
}

/* ── XML helpers ─────────────────────────────────────────────────────────── */

function xmlEscape(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/* ── xlsx builder ────────────────────────────────────────────────────────── */

/**
 * @param {string[]} headers
 * @param {(string|number|null|undefined)[][]} rows
 * @param {string} filename   - without .xlsx extension
 */
export function downloadXlsx(headers, rows, filename = 'export') {
  // Collect all unique string values for shared strings table
  const strings = [];
  const strIdx = new Map();
  const si = (v) => {
    const s = String(v ?? '');
    if (!strIdx.has(s)) { strIdx.set(s, strings.length); strings.push(s); }
    return strIdx.get(s);
  };

  // Build sheet rows XML
  const allRows = [headers, ...rows];
  const sheetRows = allRows.map((row, ri) => {
    const cells = row.map((val, ci) => {
      const col = String.fromCharCode(65 + ci);
      const ref = `${col}${ri + 1}`;
      if (val === null || val === undefined || val === '') {
        return `<c r="${ref}"/>`;
      }
      if (typeof val === 'number') {
        return `<c r="${ref}" t="n"><v>${val}</v></c>`;
      }
      // string
      return `<c r="${ref}" t="s"><v>${si(val)}</v></c>`;
    });
    return `<row r="${ri + 1}">${cells.join('')}</row>`;
  }).join('');

  const lastCol = String.fromCharCode(64 + headers.length);
  const lastRow = allRows.length;

  const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>${sheetRows}</sheetData>
</worksheet>`;

  const sharedStringsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${strings.length}" uniqueCount="${strings.length}">
${strings.map(s => `<si><t>${xmlEscape(s)}</t></si>`).join('\n')}
</sst>`;

  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
          xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="Requests" sheetId="1" r:id="rId1"/></sheets>
</workbook>`;

  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>
</Relationships>`;

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>
</Types>`;

  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

  const zip = buildZip([
    { name: '[Content_Types].xml',       data: strToBytes(contentTypes) },
    { name: '_rels/.rels',               data: strToBytes(rootRels) },
    { name: 'xl/workbook.xml',           data: strToBytes(workbookXml) },
    { name: 'xl/_rels/workbook.xml.rels',data: strToBytes(workbookRels) },
    { name: 'xl/worksheets/sheet1.xml',  data: strToBytes(sheetXml) },
    { name: 'xl/sharedStrings.xml',      data: strToBytes(sharedStringsXml) },
  ]);

  const blob = new Blob([zip], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}.xlsx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
