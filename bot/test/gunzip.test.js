import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { deflateRawSync, gzipSync } from 'node:zlib';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readXmlFile } from '../src/parse/gunzip.js';

const XML = '<?xml version="1.0"?><Root><Item>חלב</Item></Root>';

let dir;
before(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'gunzip-'));
});
after(async () => {
  await rm(dir, { recursive: true, force: true });
});

/**
 * A one-file ZIP, built by hand. `streamed` leaves the sizes in the entry's
 * own header at zero, as a ZIP written as a stream does, so only the central
 * directory carries them.
 */
function zipOf(content, { streamed = false } = {}) {
  const name = Buffer.from('prices.xml');
  const data = deflateRawSync(content);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(streamed ? 0x08 : 0, 6);
  local.writeUInt16LE(8, 8);
  local.writeUInt32LE(streamed ? 0 : data.length, 18);
  local.writeUInt32LE(streamed ? 0 : content.length, 22);
  local.writeUInt16LE(name.length, 26);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(data.length, 20);
  central.writeUInt32LE(content.length, 24);
  central.writeUInt16LE(name.length, 28);
  central.writeUInt32LE(0, 42);

  const directoryOffset = local.length + name.length + data.length;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + name.length, 12);
  end.writeUInt32LE(directoryOffset, 16);

  return Buffer.concat([local, name, data, central, name, end]);
}

async function read(name, buffer) {
  const file = path.join(dir, name);
  await writeFile(file, buffer);
  return readXmlFile(file);
}

describe('readXmlFile', () => {
  it('reads plain UTF-8', async () => {
    assert.equal(await read('utf8.xml', Buffer.from(XML, 'utf8')), XML);
  });

  it('gunzips a .gz file', async () => {
    assert.equal(await read('gz.gz', gzipSync(Buffer.from(XML, 'utf8'))), XML);
  });

  // Rami Levy's online store serves a ZIP behind a .gz name.
  it('unzips a ZIP file', async () => {
    assert.equal(await read('zip.gz', zipOf(Buffer.from(XML, 'utf8'))), XML);
  });

  it('unzips a streamed ZIP, whose sizes are only in the directory', async () => {
    const utf16 = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(XML, 'utf16le')]);
    assert.equal(await read('streamed.gz', zipOf(utf16, { streamed: true })), XML);
  });

  // Reading a UTF-16 file as UTF-8 leaves NUL bytes inside every tag name,
  // which surfaced from the XML parser as "Maximum nested tags exceeded" —
  // an error that says nothing about the real cause.
  it('decodes UTF-16LE by its BOM', async () => {
    const buffer = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(XML, 'utf16le')]);
    assert.equal(await read('utf16le.xml', buffer), XML);
  });

  it('decodes UTF-16BE by its BOM', async () => {
    const le = Buffer.from(XML, 'utf16le');
    const be = Buffer.alloc(le.length);
    for (let i = 0; i < le.length; i += 2) {
      be[i] = le[i + 1];
      be[i + 1] = le[i];
    }
    assert.equal(await read('utf16be.xml', Buffer.concat([Buffer.from([0xfe, 0xff]), be])), XML);
  });

  it('detects UTF-16 with no BOM from its NUL bytes', async () => {
    assert.equal(await read('nobom.xml', Buffer.from(XML, 'utf16le')), XML);
  });

  it('strips a UTF-8 BOM', async () => {
    const buffer = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(XML, 'utf8')]);
    assert.equal(await read('utf8bom.xml', buffer), XML);
  });
});
