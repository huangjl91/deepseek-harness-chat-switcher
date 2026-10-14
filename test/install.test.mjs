import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createArchive, readArchive, sha256 } from '../scripts/asar.mjs';
import { install, restore } from '../scripts/install.mjs';
import { buildPatch, marker } from '../scripts/build.mjs';

const compatibility = JSON.parse(readFileSync(new URL('../compatibility.json', import.meta.url)));
const metadata = { name: compatibility.application, version: compatibility.version, dshBuildCommit: compatibility.buildCommit };
// Minimal fixture with the tested upstream integration points, not a copied app.
const main = [
  '\t\tmainWindow = window;\n',
  '\tconst currentDialogWindow = () => welcomeWindow ?? mainWindow;\n',
  '\t\t\t\t\tconst attempt = state.attempt;\n',
  '\t\t\t\t\t\tshell.openExternal(platformLoginUrl(attempt.authorizeUrl)).catch(() => void 0);\n',
  '\t\ttray?.dispose();\n\t\tstopAccount?.();\n',
  '\tapp.on("before-quit", (event) => {\n'
].join('');
function fixture(t, overrides = {}) {
  const root = mkdtempSync(join(tmpdir(), 'harness-chat-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'resources'));
  const archive = createArchive({ 'package.json': JSON.stringify({ ...metadata, ...overrides }), 'lib/main.js': main, 'lib/preload-app.cjs': '// fixture preload', 'lib/unrelated.js': 'UNCHANGED' });
  const target = join(root, 'resources', 'app.asar');
  writeFileSync(target, archive);
  return { root, archive, target };
}

test('dry run validates compatibility without backup or mutation', t => {
  const { root, archive, target } = fixture(t);
  assert.equal(install(root, { dryRun: true }).dryRun, true);
  assert(readFileSync(target).equals(archive));
  assert.equal(existsSync(target + '.chat-switcher.backup'), false);
});

test('install, repeated install, restore and reinstall preserve the exact backup', t => {
  const { root, archive, target } = fixture(t);
  assert.equal(install(root).installed, true);
  const patched = readArchive(readFileSync(target));
  assert(patched.read('lib/main.js').toString().includes(marker));
  assert.equal(patched.read('lib/unrelated.js').toString(), 'UNCHANGED');
  assert.equal(install(root).alreadyInstalled, true);
  assert(readFileSync(target + '.chat-switcher.backup').equals(archive));
  assert.equal(restore(root).restored, true);
  assert(readFileSync(target).equals(archive));
  assert.equal(restore(root).alreadyRestored, true);
  assert.equal(install(root).installed, true);
});

test('unsupported releases and changed integration points fail before writing', t => {
  const { root, archive, target } = fixture(t, { version: 'future-release' });
  assert.throws(() => install(root), /Unsupported Harness build/);
  assert(readFileSync(target).equals(archive));
  assert.equal(existsSync(target + '.chat-switcher.backup'), false);
  const altered = createArchive({ 'package.json': JSON.stringify(metadata), 'lib/main.js': 'different implementation' });
  assert.throws(() => buildPatch(altered), /Unsupported main-process structure/);
});

test('restore refuses to overwrite a subsequent application update', t => {
  const { root, target } = fixture(t);
  install(root);
  const future = Buffer.from('newer application');
  writeFileSync(target, future);
  assert.throws(() => restore(root), /refusing to replace a newer build/);
  assert(readFileSync(target).equals(future));
});

test('corrupted backup fails restoration without touching the application', t => {
  const { root, target } = fixture(t);
  install(root);
  const installed = readFileSync(target);
  writeFileSync(target + '.chat-switcher.backup', 'corrupt');
  assert.throws(() => restore(root), /Backup checksum mismatch/);
  assert(readFileSync(target).equals(installed));
});

test('recovery handles a manifest written before an interrupted archive replacement', t => {
  const { root, target, archive } = fixture(t);
  install(root);
  writeFileSync(target, archive);
  assert.equal(sha256(readFileSync(target)), JSON.parse(readFileSync(target + '.chat-switcher.json')).originalSha256);
  assert.equal(install(root).installed, true);
});
