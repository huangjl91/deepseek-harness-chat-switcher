import { constants, copyFileSync, existsSync, readFileSync, renameSync, writeFileSync, lstatSync, realpathSync, unlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { buildPatch } from './build.mjs';
import { sha256 } from './asar.mjs';

export function installationPaths(appDirectory) {
  const root = realpathSync(resolve(appDirectory));
  const resources = join(root, 'resources');
  if (!lstatSync(resources).isDirectory() || lstatSync(resources).isSymbolicLink()) throw new Error('Expected a real resources directory');
  const target = join(resources, 'app.asar');
  if (lstatSync(target).isSymbolicLink() || !lstatSync(target).isFile()) throw new Error('Expected a regular app.asar file');
  return { root, target, backup: target + '.chat-switcher.backup', manifest: target + '.chat-switcher.json' };
}

export function requireClosed(root) {
  if (process.platform !== 'win32') return; // Allows synthetic fixture tests on CI.
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', "@(Get-Process -Name 'DeepSeek Harness' -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $env:DS_CHAT_CHECK_EXE }).Count"], {
    encoding: 'utf8', windowsHide: true, env: { ...process.env, DS_CHAT_CHECK_EXE: join(root, 'DeepSeek Harness.exe') }
  });
  if (result.status !== 0 || !/^\d+\s*$/.test(result.stdout || '')) throw new Error('Could not verify the application is closed; close it and try again.');
  if (Number(result.stdout) > 0) throw new Error('Exit DeepSeek Harness from the system tray before installing or restoring.');
}

// Stage in the same directory and atomically replace the file. A failed rename
// leaves the previous archive and backup intact.
function replaceFile(target, content) {
  const pending = target + '.chat-switcher.pending';
  writeFileSync(pending, content, { flag: 'wx' });
  try { renameSync(pending, target); }
  catch (error) { if (existsSync(pending)) unlinkSync(pending); throw error; }
}

export function install(appDirectory, { dryRun = false } = {}) {
  const paths = installationPaths(appDirectory);
  requireClosed(paths.root);
  const original = readFileSync(paths.target);
  const currentHash = sha256(original);
  let previous;
  if (existsSync(paths.manifest)) {
    previous = JSON.parse(readFileSync(paths.manifest, 'utf8'));
    if (currentHash === previous.patchedSha256 && previous.state === 'installed') return { alreadyInstalled: true };
    if (currentHash !== previous.originalSha256) throw new Error('Application changed after the previous patch; refusing to overwrite it.');
  }
  const { patched, metadata, compatibility } = buildPatch(original);
  if (dryRun) return { dryRun: true, version: metadata.version, patchVersion: compatibility.patchVersion };
  if (existsSync(paths.backup)) {
    if (lstatSync(paths.backup).isSymbolicLink()) throw new Error('Backup must be a regular local file');
    if (!previous || sha256(readFileSync(paths.backup)) !== currentHash) throw new Error('Existing backup does not match this installation; refusing to overwrite it.');
  } else copyFileSync(paths.target, paths.backup, constants.COPYFILE_EXCL);
  const manifest = { state: 'installed', patchVersion: compatibility.patchVersion, applicationVersion: metadata.version, originalSha256: currentHash, patchedSha256: sha256(patched), backup: 'app.asar.chat-switcher.backup' };
  // Persist recovery information before touching the application archive.
  replaceFile(paths.manifest, Buffer.from(JSON.stringify(manifest, null, 2) + '\n'));
  replaceFile(paths.target, patched);
  return { installed: true, version: metadata.version, backup: paths.backup };
}

export function restore(appDirectory) {
  const paths = installationPaths(appDirectory);
  requireClosed(paths.root);
  const manifest = JSON.parse(readFileSync(paths.manifest, 'utf8'));
  const currentHash = sha256(readFileSync(paths.target));
  const backup = readFileSync(paths.backup);
  if (sha256(backup) !== manifest.originalSha256) throw new Error('Backup checksum mismatch; restoration stopped.');
  if (currentHash === manifest.originalSha256) {
    if (manifest.state !== 'restored') replaceFile(paths.manifest, Buffer.from(JSON.stringify({ ...manifest, state: 'restored' }, null, 2) + '\n'));
    return { alreadyRestored: true };
  }
  if (currentHash !== manifest.patchedSha256) throw new Error('Application archive changed (possibly an update); refusing to replace a newer build.');
  replaceFile(paths.target, backup);
  replaceFile(paths.manifest, Buffer.from(JSON.stringify({ ...manifest, state: 'restored' }, null, 2) + '\n'));
  return { restored: true };
}

export function argumentsFor(argv) {
  const args = [...argv];
  const dryRun = args.includes('--dry-run');
  const filtered = args.filter(arg => arg !== '--dry-run');
  if (filtered.length !== 2 || filtered[0] !== '--app-dir') throw new Error('Usage: node scripts/patch.mjs --app-dir "path/to/DeepSeek Harness" [--dry-run]');
  return { appDirectory: filtered[1], dryRun };
}
