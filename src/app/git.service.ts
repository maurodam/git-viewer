import { computed, Service, signal } from '@angular/core';
import { toast } from '@spartan-ng/brain/sonner';
import { buildGraph, type Commit, laneColor } from './graph';

declare global {
  interface Window {
    api: {
      git(cwd: string, args: string[]): Promise<string>;
      openRepo(): Promise<string | null>;
      readFile(repo: string, rel: string): Promise<string>;
    };
  }
}

export interface Ref {
  name: string; // short name: main, origin/main, 5.1.16
  kind: 'local' | 'remote' | 'tag';
  hash: string;
  upstream: string;
  track: string; // e.g. "[ahead 1, behind 2]"
  head: boolean;
}

export interface FileChange {
  path: string;
  status: string; // M, A, D, R, ?, U...
  oldPath?: string; // renames and copies
}

/** A stash is a commit: parents are HEAD, the index commit and (with -u) the untracked-files commit. */
export interface Stash extends Commit {
  ref: string; // stash@{0}
}

export interface BranchInfo {
  name: string;
  upstream: string;
  ahead: number;
  behind: number;
}

export interface Diff {
  key: string; // identifies the comparison, used for tabs
  path: string;
  originalLabel: string;
  modifiedLabel: string;
  original: string;
  modified: string;
}

// ponytail: history is capped; raise or add paging if repos with longer history feel truncated.
const LOG_LIMIT = 3000;
const SEP = '\x1f';
const RECENT_KEY = 'recentRepos';

function readRecent(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
  } catch {
    return [];
  }
}

@Service()
export class GitService {
  readonly repo = signal<string | null>(null);
  readonly recent = signal<string[]>(readRecent());
  readonly busy = signal(false);

  readonly refs = signal<Ref[]>([]);
  readonly commits = signal<Commit[]>([]);
  readonly graph = computed(() => buildGraph(this.commits()));
  /** Graph color of each shown commit, so branches can be painted like their line. */
  readonly commitColors = computed(() => {
    const { rows } = this.graph();
    return new Map(this.commits().map((c, i) => [c.hash, laneColor(rows[i].lane)]));
  });
  readonly branch = signal<BranchInfo | null>(null);
  readonly staged = signal<FileChange[]>([]);
  readonly unstaged = signal<FileChange[]>([]);
  readonly stashes = signal<Stash[]>([]);

  /** Ref whose history is shown; null = HEAD. */
  readonly selectedRef = signal<string | null>(null);
  readonly showAll = signal(false);
  readonly selectedCommit = signal<Commit | null>(null);
  readonly commitBody = signal('');
  readonly commitFiles = signal<FileChange[]>([]);
  readonly diff = signal<Diff | null>(null);
  /** Diffs opened as tabs next to the history; activeTab null = history. */
  readonly tabs = signal<Diff[]>([]);
  readonly activeTab = signal<string | null>(null);

  readonly repoName = computed(() => this.repo()?.split(/[\\/]/).pop() ?? '');

  constructor() {
    const start = new URLSearchParams(location.search).get('repo') ?? this.recent()[0];
    if (start) this.setRepo(start);
    // Pick up changes made outside the app (editor, terminal) when the window regains focus.
    window.addEventListener('focus', () => this.repo() && this.refresh());
  }

  git(args: string[]): Promise<string> {
    const repo = this.repo();
    if (!repo) return Promise.reject(new Error('No repository open'));
    return window.api.git(repo, args).catch((e: Error) => {
      // Strip Electron's "Error invoking remote method 'git': Error: " prefix.
      throw new Error(e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''));
    });
  }

  /** Run a mutating command, report the outcome, then reload everything. */
  async run(args: string[], success?: string): Promise<boolean> {
    this.busy.set(true);
    try {
      await this.git(args);
      if (success) toast.success(success);
      return true;
    } catch (e) {
      toast.error(`git ${args[0]} failed`, { description: (e as Error).message });
      return false;
    } finally {
      this.busy.set(false);
      await this.refresh();
    }
  }

  async openRepo() {
    try {
      const path = await window.api.openRepo();
      if (path) this.setRepo(path);
    } catch (e) {
      toast.error('Not a git repository', { description: (e as Error).message });
    }
  }

  setRepo(path: string) {
    const recent = [path, ...this.recent().filter((p) => p !== path)].slice(0, 10);
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(recent));
    } catch {
      // Recent list is a convenience only.
    }
    this.recent.set(recent);
    this.repo.set(path);
    this.selectedRef.set(null);
    this.selectedCommit.set(null);
    this.diff.set(null);
    this.refresh();
  }

  async refresh() {
    if (!this.repo()) return;
    try {
      await Promise.all([this.loadRefs(), this.loadLog(), this.loadStatus(), this.loadStashes()]);
    } catch (e) {
      toast.error('Refresh failed', { description: (e as Error).message });
    }
  }

  async loadRefs() {
    const out = await this.git([
      'for-each-ref',
      `--format=%(refname)${SEP}%(objectname)${SEP}%(upstream:short)${SEP}%(upstream:track)${SEP}%(HEAD)`,
      'refs/heads',
      'refs/remotes',
      'refs/tags',
    ]);
    const refs: Ref[] = [];
    for (const line of out.split('\n').filter(Boolean)) {
      const [full, hash, upstream, track, head] = line.split(SEP);
      if (full.endsWith('/HEAD')) continue;
      const kind = full.startsWith('refs/heads/') ? 'local' : full.startsWith('refs/remotes/') ? 'remote' : 'tag';
      const name = full.replace(/^refs\/(heads|remotes|tags)\//, '');
      refs.push({ name, kind, hash, upstream, track, head: head === '*' });
    }
    this.refs.set(refs);
  }

  async loadLog() {
    const range = this.showAll() ? ['--all'] : [this.selectedRef() ?? 'HEAD'];
    let out = '';
    try {
      out = await this.git([
        'log',
        '--date-order',
        `-n${LOG_LIMIT}`,
        `--format=%H${SEP}%P${SEP}%an${SEP}%ae${SEP}%at${SEP}%D${SEP}%s%x1e`,
        ...range,
        '--',
      ]);
    } catch {
      // Empty repository (no commits yet) or a ref that no longer exists.
    }
    this.commits.set(
      out
        .split('\x1e')
        .map((r) => r.trim())
        .filter(Boolean)
        .map((r) => {
          const [hash, parents, author, email, date, refs, subject] = r.split(SEP);
          return {
            hash,
            parents: parents ? parents.split(' ') : [],
            author,
            email,
            date: Number(date) * 1000,
            refs: refs ? refs.split(', ') : [],
            subject,
          };
        }),
    );
  }

  async loadStatus() {
    const out = await this.git(['status', '--porcelain=v1', '-b', '-z', '--untracked-files=all']);
    const parts = out.split('\0');
    const staged: FileChange[] = [];
    const unstaged: FileChange[] = [];
    let branch: BranchInfo | null = null;
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (!p) continue;
      if (p.startsWith('## ')) {
        // "## main...origin/main [ahead 1, behind 2]" or "## No commits yet on main" or "## HEAD (no branch)"
        const m = /^## (?:No commits yet on )?(.+?)(?:\.\.\.(\S+))?(?: \[(.*)\])?$/.exec(p);
        branch = {
          name: m?.[1] ?? '',
          upstream: m?.[2] ?? '',
          ahead: Number(/ahead (\d+)/.exec(m?.[3] ?? '')?.[1] ?? 0),
          behind: Number(/behind (\d+)/.exec(m?.[3] ?? '')?.[1] ?? 0),
        };
        continue;
      }
      const x = p[0];
      const y = p[1];
      const path = p.slice(3);
      const oldPath = x === 'R' || x === 'C' ? parts[++i] : undefined; // rename: next entry is the original path
      if (x === '?') {
        unstaged.push({ path, status: '?' });
        continue;
      }
      if (x === 'U' || y === 'U' || (x === 'A' && y === 'A') || (x === 'D' && y === 'D')) {
        unstaged.push({ path, status: 'U' });
        continue;
      }
      if (x !== ' ') staged.push({ path, status: x, oldPath });
      if (y !== ' ') unstaged.push({ path, status: y });
    }
    this.branch.set(branch);
    this.staged.set(staged);
    this.unstaged.set(unstaged);
  }

  async loadStashes() {
    const out = await this.git(['stash', 'list', `--format=%gd${SEP}%H${SEP}%P${SEP}%an${SEP}%ae${SEP}%at${SEP}%s`]);
    this.stashes.set(
      out
        .split('\n')
        .filter(Boolean)
        .map((l) => {
          const [ref, hash, parents, author, email, date, subject] = l.split(SEP);
          return { ref, hash, parents: parents.split(' '), author, email, date: Number(date) * 1000, refs: [], subject };
        }),
    );
  }

  showHistory(ref: string | null) {
    this.selectedRef.set(ref);
    this.showAll.set(false);
    this.loadLog();
  }

  toggleAll() {
    this.showAll.update((v) => !v);
    this.loadLog();
  }

  async selectCommit(c: Commit) {
    this.selectedCommit.set(c);
    this.diff.set(null);
    const [body, files] = await Promise.all([
      this.git(['show', '-s', '--format=%B', c.hash]),
      this.git(['show', '--format=', '--name-status', '-z', '--diff-merges=first-parent', c.hash]),
    ]);
    if (this.selectedCommit() !== c) return;
    this.commitBody.set(body.trim());
    const parts = files.split('\0').filter(Boolean);
    const list: FileChange[] = [];
    for (let i = 0; i < parts.length; i++) {
      const status = parts[i][0];
      const oldPath = status === 'R' || status === 'C' ? parts[++i] : undefined;
      list.push({ status, oldPath, path: parts[++i] });
    }
    this.commitFiles.set(list);
  }

  async selectStash(s: Stash) {
    await this.selectCommit(s);
    // Untracked files (stash -u) live in the third parent, outside the first-parent diff.
    const untracked = s.parents[2] ? await this.git(['ls-tree', '-r', '-z', '--name-only', s.parents[2]]) : '';
    if (!untracked || this.selectedCommit() !== s) return;
    const files = untracked.split('\0').filter(Boolean).map((path) => ({ path, status: '?' }));
    this.commitFiles.update((f) => [...f, ...files]);
  }

  /** File content at a revision spec ("abc123:path", ":path" = index); empty when missing or binary. */
  private async blob(spec: string | null): Promise<string> {
    if (!spec) return '';
    const text = await this.git(['show', spec]).catch(() => '');
    return text.includes('\u0000') ? '(binary file)' : text;
  }

  async showCommitFileDiff(file: FileChange) {
    const c = this.selectedCommit();
    if (!c) return;
    const parent = c.parents[0];
    const name = file.path.slice(file.path.lastIndexOf('/') + 1);
    const [original, modified] = await Promise.all([
      this.blob(parent && file.status !== 'A' && file.status !== '?' ? `${parent}:${file.oldPath ?? file.path}` : null),
      this.blob(file.status !== 'D' ? `${file.status === '?' ? c.parents[2] : c.hash}:${file.path}` : null),
    ]);
    const diff: Diff = {
      key: `${c.hash}:${file.path}`,
      path: file.path,
      originalLabel: `${name} (${parent?.slice(0, 8) ?? 'empty'})`,
      modifiedLabel: `${name} (${c.hash.slice(0, 8)})`,
      original,
      modified,
    };
    this.diff.set(diff);
    return diff;
  }

  async showWorkingDiff(file: FileChange, staged: boolean) {
    this.selectedCommit.set(null);
    const name = file.path.slice(file.path.lastIndexOf('/') + 1);
    const tracked = file.status !== '?' && file.status !== 'A';
    const [original, modified] = staged
      ? await Promise.all([
          this.blob(tracked ? `HEAD:${file.oldPath ?? file.path}` : null),
          this.blob(file.status !== 'D' ? `:${file.path}` : null),
        ])
      : await Promise.all([
          this.blob(file.status !== '?' ? `:${file.path}` : null),
          file.status === 'D' ? '' : window.api.readFile(this.repo()!, file.path).catch(() => ''),
        ]);
    this.diff.set({
      key: `${staged ? 'staged' : 'worktree'}:${file.path}`,
      path: file.path,
      originalLabel: `${name} (${staged ? 'HEAD' : 'index'})`,
      modifiedLabel: `${name} (${staged ? 'staged' : 'working tree'})`,
      original,
      modified,
    });
  }

  /** Hides the bottom details/diff panel until a commit or file is picked again. */
  closeDetails() {
    this.selectedCommit.set(null);
    this.diff.set(null);
  }

  openTab(d: Diff) {
    if (!this.tabs().some((t) => t.key === d.key)) this.tabs.update((t) => [...t, d]);
    this.activeTab.set(d.key);
  }

  closeTab(key: string) {
    this.tabs.update((t) => t.filter((x) => x.key !== key));
    if (this.activeTab() === key) this.activeTab.set(this.tabs().at(-1)?.key ?? null);
  }

  // ---- branch actions ----

  checkout(ref: Ref) {
    if (ref.kind === 'local') return this.run(['switch', ref.name], `Switched to ${ref.name}`);
    if (ref.kind === 'tag') return this.run(['switch', '--detach', ref.name], `Checked out tag ${ref.name}`);
    const local = ref.name.slice(ref.name.indexOf('/') + 1);
    const exists = this.refs().some((r) => r.kind === 'local' && r.name === local);
    return this.run(exists ? ['switch', local] : ['switch', '--track', ref.name], `Switched to ${local}`);
  }

  createBranch(name: string, from: string, checkout = true) {
    return this.run(checkout ? ['switch', '-c', name, from] : ['branch', name, from], `Created branch ${name}`);
  }

  deleteBranch(name: string, force = false) {
    return this.run(['branch', force ? '-D' : '-d', name], `Deleted branch ${name}`);
  }

  /** "origin/feature/x" -> git push origin --delete feature/x */
  deleteRemoteBranch(name: string) {
    const slash = name.indexOf('/');
    return this.run(['push', name.slice(0, slash), '--delete', name.slice(slash + 1)], `Deleted ${name}`);
  }

  // ---- sync ----

  fetch() {
    return this.run(['fetch', '--all', '--prune'], 'Fetched');
  }

  pull() {
    return this.run(['pull'], 'Pulled');
  }

  push() {
    const b = this.branch();
    if (b && !b.upstream) return this.run(['push', '-u', 'origin', b.name], `Published ${b.name}`);
    return this.run(['push'], 'Pushed');
  }

  // ---- working tree ----

  stage(paths: string[]) {
    return this.run(['add', '-A', '--', ...paths]);
  }

  unstage(paths: string[]) {
    return this.run(['restore', '--staged', '--', ...paths]);
  }

  discard(file: FileChange) {
    if (file.status === '?') return this.run(['clean', '-f', '--', file.path], `Deleted ${file.path}`);
    return this.run(['restore', '--', file.path], `Discarded changes in ${file.path}`);
  }

  async commit(message: string, amend: boolean) {
    if (!this.staged().length && !amend && !(await this.run(['add', '-A']))) return false;
    return this.run(['commit', '-m', message, ...(amend ? ['--amend'] : [])], 'Committed');
  }
}
