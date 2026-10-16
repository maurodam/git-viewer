import { Component, inject, signal } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideArchive,
  lucideArrowDown,
  lucideArrowDownToLine,
  lucideArrowUp,
  lucideArrowUpFromLine,
  lucideChevronDown,
  lucideChevronRight,
  lucideChevronsDownUp,
  lucideChevronsUpDown,
  lucideMinus,
  lucidePlus,
  lucideRefreshCcwDot,
  lucideTrash2,
  lucideUndo2,
} from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmCheckboxImports } from '@spartan-ng/helm/checkbox';
import { HlmDropdownMenuImports } from '@spartan-ng/helm/dropdown-menu';
import { HlmTextareaImports } from '@spartan-ng/helm/textarea';
import { HlmTooltipImports } from '@spartan-ng/helm/tooltip';
import { injectAsk } from './ask-dialog';
import { FileList } from './file-list';
import { type FileChange, GitService, type Stash } from './git.service';

@Component({
  selector: 'app-changes',
  imports: [NgIcon, HlmButtonImports, HlmCheckboxImports, HlmDropdownMenuImports, HlmTextareaImports, HlmTooltipImports, FileList],
  providers: [
    provideIcons({
      lucideArchive,
      lucideArrowDown,
      lucideArrowDownToLine,
      lucideArrowUp,
      lucideArrowUpFromLine,
      lucideChevronDown,
      lucideChevronRight,
      lucideChevronsDownUp,
      lucideChevronsUpDown,
      lucideMinus,
      lucidePlus,
      lucideRefreshCcwDot,
      lucideTrash2,
      lucideUndo2,
    }),
  ],
  host: { class: 'flex h-full flex-col bg-sidebar text-sidebar-foreground' },
  template: `
    <div class="border-b p-3">
      <div class="text-muted-foreground mb-2 flex items-center gap-2 text-xs">
        <span class="text-foreground truncate text-sm font-semibold">{{ git.branch()?.name }}</span>
        @if (git.branch(); as b) {
          @if (b.upstream) {
            <span class="tabular-nums" [title]="'Tracking ' + b.upstream">↑{{ b.ahead }} ↓{{ b.behind }}</span>
          } @else {
            <span>not published</span>
          }
        }
        <div class="ms-auto flex shrink-0 items-center">
          <button hlmBtn variant="ghost" size="icon-xs" hlmTooltip="Fetch" aria-label="Fetch" [disabled]="git.busy()" (click)="git.fetch()">
            <ng-icon name="lucideRefreshCcwDot" />
          </button>
          <button hlmBtn variant="ghost" size="icon-xs" hlmTooltip="Pull" aria-label="Pull" [disabled]="git.busy()" (click)="git.pull()">
            <ng-icon name="lucideArrowDownToLine" />
          </button>
          <button hlmBtn variant="ghost" size="icon-xs" hlmTooltip="Push" aria-label="Push" [disabled]="git.busy()" (click)="git.push()">
            <ng-icon name="lucideArrowUpFromLine" />
          </button>
        </div>
      </div>
      <textarea
        hlmTextarea
        class="min-h-20 w-full resize-y text-[13px]"
        placeholder="Commit message (Ctrl+Enter to commit)"
        aria-label="Commit message"
        [value]="message()"
        (input)="message.set($any($event.target).value)"
        (keydown.control.enter)="commit()"
      ></textarea>
      <div class="mt-2 flex items-center gap-3">
        <div class="flex flex-1">
          <button hlmBtn size="sm" class="flex-1 rounded-e-none" [disabled]="!canCommit()" (click)="commit()">
            {{ amend() ? 'Amend commit' : git.staged().length ? 'Commit staged' : 'Commit all' }}
          </button>
          <button
            hlmBtn
            size="icon-sm"
            class="border-primary-foreground/20 rounded-s-none border-s"
            aria-label="More commit options"
            [disabled]="!canCommit() || amend()"
            [hlmDropdownMenuTrigger]="commitMenu"
          >
            <ng-icon name="lucideChevronDown" />
          </button>
        </div>
        <ng-template #commitMenu>
          <hlm-dropdown-menu class="w-52">
            <button hlmDropdownMenuItem (triggered)="commit(true)">
              <ng-icon name="lucideArrowUpFromLine" />
              {{ git.staged().length ? 'Commit staged and push' : 'Commit all and push' }}
            </button>
          </hlm-dropdown-menu>
        </ng-template>
        <label class="flex items-center gap-1.5 text-xs">
          <hlm-checkbox [checked]="amend()" (checkedChange)="toggleAmend($event)" />
          Amend
        </label>
      </div>
    </div>

    <div class="min-h-0 flex-1 overflow-auto p-2">
      <div class="flex justify-end px-1">
        <button
          hlmBtn
          variant="ghost"
          size="icon-xs"
          [hlmTooltip]="allOpen() ? 'Collapse all' : 'Expand all'"
          [attr.aria-label]="allOpen() ? 'Collapse all' : 'Expand all'"
          (click)="setAll(!allOpen())"
        >
          <ng-icon [name]="allOpen() ? 'lucideChevronsDownUp' : 'lucideChevronsUpDown'" />
        </button>
      </div>
      <!-- Staged -->
      <div class="flex h-8 items-center gap-1 px-1">
        <button class="flex flex-1 items-center gap-1 text-xs font-semibold" (click)="toggle('staged')" [attr.aria-expanded]="open().staged">
          <ng-icon name="lucideChevronRight" size="14" class="transition-transform" [class.rotate-90]="open().staged" />
          Staged changes ({{ git.staged().length }})
        </button>
        @if (git.staged().length) {
          <button hlmBtn variant="ghost" size="icon-xs" hlmTooltip="Unstage all" aria-label="Unstage all" (click)="git.unstage(['.'])">
            <ng-icon name="lucideMinus" />
          </button>
        }
      </div>
      @if (open().staged) {
        <app-file-list [files]="git.staged()" [groupByFolder]="true" [repoPath]="git.repo() ?? ''" (open)="git.showWorkingDiff($event, true)">
          <ng-template let-f>
            <button hlmBtn variant="ghost" size="icon-xs" aria-label="Unstage" (click)="$event.stopPropagation(); git.unstage([f.path])">
              <ng-icon name="lucideMinus" />
            </button>
          </ng-template>
        </app-file-list>
      }

      <!-- Unstaged -->
      <div class="mt-2 flex h-8 items-center gap-1 px-1">
        <button class="flex flex-1 items-center gap-1 text-xs font-semibold" (click)="toggle('changes')" [attr.aria-expanded]="open().changes">
          <ng-icon name="lucideChevronRight" size="14" class="transition-transform" [class.rotate-90]="open().changes" />
          Changes ({{ git.unstaged().length }})
        </button>
        @if (git.unstaged().length) {
          <button hlmBtn variant="ghost" size="icon-xs" hlmTooltip="Stash all" aria-label="Stash all" (click)="stashAll()">
            <ng-icon name="lucideArchive" />
          </button>
          <button hlmBtn variant="ghost" size="icon-xs" hlmTooltip="Stage all" aria-label="Stage all" (click)="git.stage(['.'])">
            <ng-icon name="lucidePlus" />
          </button>
        }
      </div>
      @if (open().changes) {
        <app-file-list [files]="git.unstaged()" [groupByFolder]="true" [repoPath]="git.repo() ?? ''" (open)="git.showWorkingDiff($event, false)">
          <ng-template let-f>
            <button hlmBtn variant="ghost" size="icon-xs" aria-label="Discard changes" (click)="$event.stopPropagation(); discard(f)">
              <ng-icon name="lucideUndo2" />
            </button>
            <button hlmBtn variant="ghost" size="icon-xs" aria-label="Stage" (click)="$event.stopPropagation(); git.stage([f.path])">
              <ng-icon name="lucidePlus" />
            </button>
          </ng-template>
        </app-file-list>
      }

      <!-- Stashes -->
      <div class="mt-2 flex h-8 items-center gap-1 px-1">
        <button class="flex flex-1 items-center gap-1 text-xs font-semibold" (click)="toggle('stashes')" [attr.aria-expanded]="open().stashes">
          <ng-icon name="lucideChevronRight" size="14" class="transition-transform" [class.rotate-90]="open().stashes" />
          Stashes ({{ git.stashes().length }})
        </button>
      </div>
      @if (open().stashes) {
        <ul class="text-[13px]">
          @for (s of git.stashes(); track s.ref) {
            <li
              tabindex="0"
              class="group/row hover:bg-muted/60 focus-visible:ring-ring flex h-7 cursor-default items-center gap-2 rounded-lg px-2 outline-none focus-visible:ring-2"
              [class.bg-accent]="git.selectedCommit()?.hash === s.hash"
              [title]="s.subject"
              (click)="git.selectStash(s)"
              (keydown.enter)="git.selectStash(s)"
            >
              <ng-icon name="lucideArchive" size="13" class="text-muted-foreground shrink-0" />
              <span class="min-w-0 flex-1 truncate">{{ s.subject }}</span>
              <span class="hidden shrink-0 gap-0.5 group-focus-within/row:flex group-hover/row:flex" (click)="$event.stopPropagation()" (keydown.enter)="$event.stopPropagation()">
                <button hlmBtn variant="ghost" size="xs" (click)="git.run(['stash', 'apply', s.ref], 'Stash applied')">Apply</button>
                <button hlmBtn variant="ghost" size="xs" (click)="git.run(['stash', 'pop', s.ref], 'Stash popped')">Pop</button>
                <button hlmBtn variant="ghost" size="icon-xs" aria-label="Drop stash" (click)="drop(s)">
                  <ng-icon name="lucideTrash2" />
                </button>
              </span>
            </li>
          } @empty {
            <li class="text-muted-foreground px-2 py-1 text-xs">No stashes</li>
          }
        </ul>
      }
    </div>
  `,
})
export class Changes {
  protected readonly git = inject(GitService);
  private readonly ask = injectAsk();
  protected readonly message = signal('');
  protected readonly amend = signal(false);
  protected readonly open = signal({ staged: true, changes: true, stashes: true });

  protected canCommit() {
    return !!this.message().trim() && (this.amend() || this.git.staged().length + this.git.unstaged().length > 0);
  }

  protected allOpen() {
    const o = this.open();
    return o.staged && o.changes && o.stashes;
  }

  protected setAll(open: boolean) {
    this.open.set({ staged: open, changes: open, stashes: open });
  }

  protected toggle(key: 'staged' | 'changes' | 'stashes') {
    this.open.update((o) => ({ ...o, [key]: !o[key] }));
  }

  protected async toggleAmend(on: boolean) {
    this.amend.set(on);
    if (on && !this.message().trim()) {
      this.message.set((await this.git.git(['log', '-1', '--format=%B'])).trim());
    }
  }

  protected async commit(push = false) {
    if (!this.canCommit()) return;
    if (await this.git.commit(this.message().trim(), this.amend())) {
      this.message.set('');
      this.amend.set(false);
      if (push) await this.git.push();
    }
  }

  protected async stashAll() {
    const msg = await this.ask({ title: 'Stash all changes', input: 'Message (optional)', value: 'WIP', confirm: 'Stash' });
    if (typeof msg === 'string') await this.git.run(['stash', 'push', '--include-untracked', '-m', msg], 'Changes stashed');
  }

  protected async discard(f: FileChange) {
    const ok = await this.ask({
      title: f.status === '?' ? 'Delete untracked file?' : 'Discard changes?',
      description: 'This cannot be undone.',
      detail: f.path,
      confirm: f.status === '?' ? 'Delete' : 'Discard',
      destructive: true,
    });
    if (ok) await this.git.discard(f);
  }

  protected async drop(s: Stash) {
    const ok = await this.ask({ title: `Drop ${s.ref}?`, description: s.subject, confirm: 'Drop', destructive: true });
    if (ok) await this.git.run(['stash', 'drop', s.ref], 'Stash dropped');
  }
}
