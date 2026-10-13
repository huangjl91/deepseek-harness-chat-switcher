import test from 'node:test';
import assert from 'node:assert/strict';
import { appendFiles, createArchive, readArchive } from '../scripts/asar.mjs';

test('append preserves unrelated files and verifies new content', () => {
  const original = createArchive({ 'package.json': '{}', 'lib/unrelated.txt': 'unchanged', 'lib/main.js': 'original' });
  const patched = appendFiles(original, { 'lib/main.js': 'modified', 'renderer/new.html': '<p>chat</p>' });
  const read = readArchive(patched).read;
  assert.equal(read('lib/main.js').toString(), 'modified');
  assert.equal(read('lib/unrelated.txt').toString(), 'unchanged');
  assert.equal(read('renderer/new.html').toString(), '<p>chat</p>');
  assert.equal(readArchive(original).read('lib/main.js').toString(), 'original');
});

test('corrupted archive and modified contents are rejected', () => {
  assert.throws(() => readArchive(Buffer.alloc(4)), /Invalid ASAR/);
  const bytes = createArchive({ 'file.txt': 'safe' });
  bytes[bytes.length - 1] ^= 1;
  assert.throws(() => readArchive(bytes).read('file.txt'), /integrity mismatch/);
});

test('unsafe archive paths cannot be appended', () => {
  const bytes = createArchive({ 'file.txt': 'safe' });
  assert.throws(() => appendFiles(bytes, { '../bad': 'bad' }), /Invalid archive path/);
  assert.throws(() => appendFiles(bytes, { '__proto__/bad': 'bad' }), /Invalid archive path/);
});
