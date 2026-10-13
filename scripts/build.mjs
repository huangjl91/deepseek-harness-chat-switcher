import { readFileSync } from 'node:fs';
import { readArchive, appendFiles } from './asar.mjs';

const compatibility = JSON.parse(readFileSync(new URL('../compatibility.json', import.meta.url)));
export const marker = '// deepseek-harness-chat-switcher v' + compatibility.patchVersion;

export function buildPatch(original) {
  const archive = readArchive(original);
  const metadata = JSON.parse(archive.read('package.json'));
  if (metadata.name !== compatibility.application || metadata.version !== compatibility.version || metadata.dshBuildCommit !== compatibility.buildCommit) throw new Error('Unsupported Harness build. See compatibility.json; the application has not been changed.');
  let main = archive.read('lib/main.js').toString('utf8');
  if (main.includes(marker) || main.includes('installChatMode')) throw new Error('Archive already contains a chat switcher. Restore its original backup first.');
  // Match the tested upstream composition rather than silently editing a new release.
  const replace = (before, after) => {
    if (main.split(before).length !== 2) throw new Error('Unsupported main-process structure; no files have been changed.');
    main = main.replace(before, after);
  };
  replace('\t\tmainWindow = window;\n', '\t\tmainWindow = window;\n\t\tinstallChatMode(window, () => !isMandatory());\n');
  replace('\tconst currentDialogWindow = () => welcomeWindow ?? mainWindow;\n', '\tconst currentDialogWindow = () => welcomeWindow ?? mainWindow;\n\tconst workLoginBrowser = createWorkLoginBrowser({ getParent: currentDialogWindow, cancel: id => welcomeBackend?.account.cancel(id), focusOwner: () => focusPrimaryWindow() });\n');
  replace('\t\t\t\t\tconst attempt = state.attempt;\n', '\t\t\t\t\tworkLoginBrowser.sync(state);\n\t\t\t\t\tconst attempt = state.attempt;\n');
  replace('\t\t\t\t\t\tshell.openExternal(platformLoginUrl(attempt.authorizeUrl)).catch(() => void 0);', '\t\t\t\t\t\tworkLoginBrowser.open(platformLoginUrl(attempt.authorizeUrl), attempt.id, hostUrl);');
  replace('\t\ttray?.dispose();\n\t\tstopAccount?.();\n', '\t\ttray?.dispose();\n\t\tstopAccount?.();\n\t\tworkLoginBrowser.dispose();\n');
  replace('\tapp.on("before-quit", (event) => {\n', '\tapp.on("before-quit", (event) => {\n\t\tworkLoginBrowser.dispose();\n');
  main = `${marker}\nimport { installChatMode } from './chat-mode.js';\nimport { createWorkLoginBrowser } from './work-login.js';\n` + main;
  const files = { 'lib/main.js': Buffer.from(main) };
  for (const [name, destination] of Object.entries({
    'chat-mode.js': 'lib/chat-mode.js', 'work-login.js': 'lib/work-login.js',
    'preload-chat-toolbar.cjs': 'lib/preload-chat-toolbar.cjs', 'chat-toolbar.html': 'renderer/chat-toolbar.html'
  })) files[destination] = readFileSync(new URL('../src/' + name, import.meta.url));
  const patched = appendFiles(original, files);
  const check = readArchive(patched);
  for (const [name, data] of Object.entries(files)) if (!check.read(name).equals(data)) throw new Error('Patched archive verification failed');
  return { patched, metadata, compatibility };
}
