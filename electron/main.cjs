const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const { execFile } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs/promises');

const DEV = process.argv.includes('--dev');

// Only these git subcommands can be run from the renderer.
const ALLOWED = new Set([
  'add', 'branch', 'checkout', 'cherry-pick', 'commit', 'diff', 'fetch', 'for-each-ref', 'log',
  'merge', 'pull', 'push', 'rebase', 'reset', 'restore', 'rev-parse', 'revert', 'show',
  'stash', 'status', 'switch', 'tag', 'clean',
]);

function git(cwd, args) {
  return new Promise((resolve, reject) => {
    if (!Array.isArray(args) || !ALLOWED.has(args[0]) || !args.every((a) => typeof a === 'string')) {
      return reject(new Error(`git command not allowed: ${args?.[0]}`));
    }
    execFile(
      'git',
      args,
      {
        cwd,
        maxBuffer: 512 * 1024 * 1024,
        windowsHide: true,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0', LC_ALL: 'C.UTF-8' },
      },
      (err, stdout, stderr) => (err ? reject(new Error(stderr.trim() || stdout.trim() || err.message)) : resolve(stdout)),
    );
  });
}

async function createWindow() {
  const win = new BrowserWindow({
    width: 1600,
    height: 950,
    minWidth: 900,
    minHeight: 500,
    title: 'Git Viewer',
    autoHideMenuBar: true,
    backgroundColor: '#18181b',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
    },
  });

  // Links open in the system browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Optional repo path on the command line: `electron . C:\src\my-repo` (also used by the
  // Explorer "Open in Git Viewer" entry, which may pass a subfolder: resolve to the repo root).
  const arg = process.argv.slice(app.isPackaged ? 1 : 2).find((a) => !a.startsWith('-'));
  const repo = arg ? await git(path.resolve(arg), ['rev-parse', '--show-toplevel']).then((r) => r.trim(), () => path.resolve(arg)) : '';
  const query = repo ? { repo } : {};

  if (DEV) {
    // ng serve may still be compiling: retry until it answers.
    const url = 'http://localhost:4200' + (repo ? `?repo=${encodeURIComponent(query.repo)}` : '');
    const load = () => win.loadURL(url).catch(() => setTimeout(load, 1000));
    load();
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    // getAppPath() is the project root in dev and resources/app.asar when packaged.
    win.loadFile(path.join(app.getAppPath(), 'dist', 'git-viewer', 'browser', 'index.html'), { query });
  }
}

ipcMain.handle('git', (_e, cwd, args) => git(cwd, args));

// Working-tree file content for diffs; only paths inside the repository are readable.
ipcMain.handle('read-file', (_e, repo, rel) => {
  const root = path.resolve(repo);
  const file = path.resolve(root, rel);
  if (typeof rel !== 'string' || !file.startsWith(root + path.sep)) throw new Error('Path outside repository');
  return fs.readFile(file, 'utf8');
});

ipcMain.handle('open-repo', async () => {
  const res = await dialog.showOpenDialog({ properties: ['openDirectory'] });
  if (res.canceled || !res.filePaths[0]) return null;
  // Resolve to the repository root; throws if the folder is not a git repo.
  return (await git(res.filePaths[0], ['rev-parse', '--show-toplevel'])).trim();
});

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
