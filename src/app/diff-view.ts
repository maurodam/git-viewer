import { Component, DestroyRef, effect, ElementRef, inject, input, signal, untracked, viewChild } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideArrowDown, lucideArrowUp, lucideColumns2, lucideExternalLink, lucideRows2, lucideX } from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmTooltipImports } from '@spartan-ng/helm/tooltip';
import type * as Monaco from 'monaco-editor';
import { type Diff, GitService } from './git.service';
import { loadMonaco } from './monaco';

let modelId = 0;

/** Side-by-side diff of two full file versions (Monaco, the VS Code diff editor). */
@Component({
  selector: 'app-diff-view',
  imports: [NgIcon, HlmButtonImports, HlmTooltipImports],
  providers: [provideIcons({ lucideArrowDown, lucideArrowUp, lucideColumns2, lucideExternalLink, lucideRows2, lucideX })],
  host: { class: 'flex h-full min-h-0 min-w-0 flex-col' },
  template: `
    <div class="flex h-9 shrink-0 items-center gap-1 border-b px-2 text-xs">
      <button hlmBtn variant="ghost" size="icon-xs" hlmTooltip="Previous change" aria-label="Previous change" (click)="go('previous')">
        <ng-icon name="lucideArrowUp" />
      </button>
      <button hlmBtn variant="ghost" size="icon-xs" hlmTooltip="Next change" aria-label="Next change" (click)="go('next')">
        <ng-icon name="lucideArrowDown" />
      </button>
      <span class="ms-1 whitespace-nowrap">{{ stats().changes }} {{ stats().changes === 1 ? 'change' : 'changes' }}</span>
      <span class="rounded-md bg-red-500/20 px-1.5 py-0.5 font-medium text-red-600 tabular-nums dark:text-red-300">-{{ stats().removed }}</span>
      <span class="rounded-md bg-emerald-500/20 px-1.5 py-0.5 font-medium text-emerald-700 tabular-nums dark:text-emerald-300">+{{ stats().added }}</span>
      <span class="text-muted-foreground ms-2 min-w-0 truncate" [title]="diff().path">{{ diff().path }}</span>
      <div class="ms-auto flex shrink-0 items-center gap-0.5">
        <button
          hlmBtn
          variant="ghost"
          size="icon-xs"
          [hlmTooltip]="sideBySide() ? 'Inline view' : 'Side-by-side view'"
          aria-label="Toggle inline or side-by-side view"
          (click)="sideBySide.set(!sideBySide())"
        >
          <ng-icon [name]="sideBySide() ? 'lucideRows2' : 'lucideColumns2'" />
        </button>
        @if (!inTab()) {
          <button hlmBtn variant="ghost" size="icon-xs" hlmTooltip="Open in new tab" aria-label="Open in new tab" (click)="git.openTab(diff())">
            <ng-icon name="lucideExternalLink" />
          </button>
          <button hlmBtn variant="ghost" size="icon-xs" hlmTooltip="Close" aria-label="Close diff" (click)="git.closeDetails()">
            <ng-icon name="lucideX" />
          </button>
        }
      </div>
    </div>
    @if (sideBySide()) {
      <div class="grid h-7 shrink-0 grid-cols-2 border-b text-xs font-semibold">
        <div class="truncate px-3 py-1.5" [title]="diff().originalLabel">{{ diff().originalLabel }}</div>
        <div class="truncate border-s px-3 py-1.5" [title]="diff().modifiedLabel">{{ diff().modifiedLabel }}</div>
      </div>
    }
    <div #host class="min-h-0 flex-1"></div>
  `,
})
export class DiffView {
  protected readonly git = inject(GitService);
  readonly diff = input.required<Diff>();
  /** Shown in a tab: no "open in tab" / close buttons. */
  readonly inTab = input(false);

  protected readonly sideBySide = signal(true);
  protected readonly stats = signal({ changes: 0, added: 0, removed: 0 });
  private readonly host = viewChild.required<ElementRef<HTMLElement>>('host');
  private readonly monaco = signal<typeof Monaco | null>(null);
  private editor?: Monaco.editor.IStandaloneDiffEditor;
  private models: Monaco.editor.ITextModel[] = [];

  constructor() {
    loadMonaco().then((m) => this.monaco.set(m));

    // Follow the app theme (the "dark" class on <html>).
    const observer = new MutationObserver(() => this.monaco()?.editor.setTheme(this.theme()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    effect(() => {
      const m = this.monaco();
      if (!m) return;
      this.editor ??= untracked(() => this.create(m));
      const d = this.diff();
      const old = this.models;
      // Unique URIs; the file extension in the path picks the syntax highlighting.
      const id = ++modelId;
      this.models = [
        m.editor.createModel(d.original, undefined, m.Uri.from({ scheme: 'diff', path: `/${id}/a/${d.path}` })),
        m.editor.createModel(d.modified, undefined, m.Uri.from({ scheme: 'diff', path: `/${id}/b/${d.path}` })),
      ];
      this.editor.setModel({ original: this.models[0], modified: this.models[1] });
      old.forEach((x) => x.dispose());
    });

    effect(() => this.editor?.updateOptions({ renderSideBySide: this.sideBySide() }));

    inject(DestroyRef).onDestroy(() => {
      observer.disconnect();
      this.editor?.dispose();
      this.models.forEach((x) => x.dispose());
    });
  }

  private theme() {
    return document.documentElement.classList.contains('dark') ? 'vs-dark' : 'vs';
  }

  private create(m: typeof Monaco) {
    m.editor.setTheme(this.theme());
    const editor = m.editor.createDiffEditor(this.host().nativeElement, {
      readOnly: true,
      originalEditable: false,
      automaticLayout: true,
      renderSideBySide: this.sideBySide(),
      useInlineViewWhenSpaceIsLimited: false,
      ignoreTrimWhitespace: false,
      renderOverviewRuler: true,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      fontSize: 13,
      fontFamily: "'Cascadia Mono', Consolas, 'Courier New', monospace",
    });
    let first = true;
    editor.onDidUpdateDiff(() => {
      const changes = editor.getLineChanges() ?? [];
      const lines = (start: number, end: number) => (end > 0 ? end - start + 1 : 0);
      this.stats.set({
        changes: changes.length,
        removed: changes.reduce((n, c) => n + lines(c.originalStartLineNumber, c.originalEndLineNumber), 0),
        added: changes.reduce((n, c) => n + lines(c.modifiedStartLineNumber, c.modifiedEndLineNumber), 0),
      });
      if (first) editor.revealFirstDiff();
      first = false;
    });
    editor.onDidChangeModel(() => (first = true));
    return editor;
  }

  protected go(target: 'next' | 'previous') {
    this.editor?.goToDiff(target);
  }
}
