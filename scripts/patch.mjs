import { install, argumentsFor } from './install.mjs';
try {
  const { appDirectory, dryRun } = argumentsFor(process.argv.slice(2));
  console.log(JSON.stringify(install(appDirectory, { dryRun }), null, 2));
} catch (error) { console.error(error.message); process.exitCode = 1; }
