import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';

/**
 * Reads a published price file as text.
 *
 * Two traps live here. Some portals serve plain XML from a .gz link, so the
 * gzip magic bytes decide whether to decompress rather than the extension.
 * And several chains publish UTF-16 rather than UTF-8 — decoding those as
 * UTF-8 yields tag names padded with NUL bytes, which the XML parser then
 * fails on in confusing ways.
 */
export async function readXmlFile(filePath) {
  const raw = await readFile(filePath);
  const isGzip = raw[0] === 0x1f && raw[1] === 0x8b;
  const buffer = isGzip ? gunzipSync(raw) : raw;
  return stripBom(decode(buffer));
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
