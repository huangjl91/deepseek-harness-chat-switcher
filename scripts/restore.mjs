import { restore, argumentsFor } from './install.mjs';
try {
  const { appDirectory, dryRun } = argumentsFor(process.argv.slice(2));
  if (dryRun) throw new Error('--dry-run is available on patch.mjs only.');
  console.log(JSON.stringify(restore(appDirectory), null, 2));
} catch (error) { console.error(error.message); process.exitCode = 1; }
