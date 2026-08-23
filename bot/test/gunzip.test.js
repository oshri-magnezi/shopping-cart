import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
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
