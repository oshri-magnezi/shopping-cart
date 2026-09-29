import { readFile } from 'node:fs/promises';
import { gunzipSync, inflateRawSync } from 'node:zlib';

/**
 * Reads a published price file as text.
 *
 * Three traps live here. Some portals serve plain XML from a .gz link, and
 * some serve a ZIP from one — Rami Levy's online store does — so the magic
 * bytes decide how to decompress rather than the extension.
 * And several chains publish UTF-16 rather than UTF-8 — decoding those as
 * UTF-8 yields tag names padded with NUL bytes, which the XML parser then
 * fails on in confusing ways.
 */
export async function readXmlFile(filePath) {
  const raw = await readFile(filePath);
  const isGzip = raw[0] === 0x1f && raw[1] === 0x8b;
  const isZip = raw[0] === 0x50 && raw[1] === 0x4b && raw[2] === 0x03 && raw[3] === 0x04;
  const buffer = isGzip ? gunzipSync(raw) : isZip ? unzipFirstEntry(raw) : raw;
  return stripBom(decode(buffer));
}

/**
 * The one file inside a ZIP, without a library.
 *
 * A price-file ZIP holds a single XML file. Its sizes are read from the
 * central directory at the end of the archive, not from the entry's own
 * header, because a ZIP written as a stream leaves those header fields at
 * zero and puts the real sizes after the data instead.
 */
function unzipFirstEntry(zip) {
  const END_OF_DIRECTORY = 0x06054b50;
  let end = zip.length - 22;
  while (end >= 0 && zip.readUInt32LE(end) !== END_OF_DIRECTORY) end -= 1;
  if (end < 0) throw new Error('קובץ ZIP פגום: לא נמצא סוף הספרייה');

  const entry = zip.readUInt32LE(end + 16);
  const method = zip.readUInt16LE(entry + 10);
  const compressedSize = zip.readUInt32LE(entry + 20);
  const header = zip.readUInt32LE(entry + 42);

  const nameLength = zip.readUInt16LE(header + 26);
  const extraLength = zip.readUInt16LE(header + 28);
  const start = header + 30 + nameLength + extraLength;
  const data = zip.subarray(start, start + compressedSize);

  if (method === 0) return data;
  if (method === 8) return inflateRawSync(data);
  throw new Error(`קובץ ZIP בשיטת דחיסה שאינה נתמכת (${method})`);
}

function decode(buffer) {
  if (buffer[0] === 0xff && buffer[1] === 0xfe) return buffer.toString('utf16le');
  if (buffer[0] === 0xfe && buffer[1] === 0xff) return swap16(buffer).toString('utf16le');

  // No BOM: UTF-16 still gives itself away as NUL bytes between ASCII chars.
  const sample = buffer.subarray(0, 200);
  const nulls = sample.filter((byte) => byte === 0x00).length;
  if (nulls > sample.length / 4) return buffer.toString('utf16le');

  return buffer.toString('utf8');
}

function swap16(buffer) {
  const copy = Buffer.from(buffer);
  copy.swap16();
  return copy;
}

function stripBom(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}
