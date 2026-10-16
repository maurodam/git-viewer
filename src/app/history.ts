import { ScrollingModule } from '@angular/cdk/scrolling';
import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideGitBranch, lucideSearch, lucideTag } from '@ng-icons/lucide';
import { toast } from '@spartan-ng/brain/sonner';
import { HlmBadgeImports } from '@spartan-ng/helm/badge';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmContextMenuImports } from '@spartan-ng/helm/context-menu';
import { HlmDropdownMenuImports } from '@spartan-ng/helm/dropdown-menu';
import { HlmInputImports } from '@spartan-ng/helm/input';
import { injectAsk } from './ask-dialog';
import { GitService } from './git.service';
import { type Commit, laneColor } from './graph';

const ROW = 28;
const LANE = 14;
const MAX_LANES = 14;

@Component({
  selector: 'app-history',
  imports: [
    ScrollingModule,
    DatePipe,
    NgIcon,
    HlmBadgeImports,
    HlmButtonImports,
    HlmInputImports,
    HlmContextMenuImports,
    HlmDropdownMenuImports,
  ],
  providers: [provideIcons({ lucideGitBranch, lucideSearch, lucideTag })],
  host: { class: 'flex h-full flex-col' },
  template: `
    <div class="flex items-center gap-2 border-b px-3 py-2">
      <span class="text-muted-foreground text-xs">Branch / Tag</span>
      <span class="truncate text-sm font-semibold">
        {{ git.showAll() ? 'All branches' : (git.selectedRef() ?? git.branch()?.name ?? 'HEAD') }}
      </span>
      <button hlmBtn size="xs" [variant]="git.showAll() ? 'default' : 'outline'" (click)="git.toggleAll()">
        All branches
      </button>
      @if (git.selectedCommit(); as selected) {
        <button hlmBtn variant="ghost" size="xs" [disabled]="git.busy()" (click)="addTag(selected)">
          <ng-icon name="lucideTag" size="13" /> Add tag…
        </button>
      }
      <div class="relative ms-auto w-72">
        <ng-icon name="lucideSearch" size="14" class="text-muted-foreground absolute top-1/2 left-2.5 -translate-y-1/2" />
        <input
          hlmInput
          class="h-8 ps-8 text-xs"
          placeholder="Filter history (message, author, id)"
          aria-label="Filter history"
          [value]="filter()"
          (input)="filter.set($any($event.target).value)"
        />
      </div>
    </div>

    <div class="text-muted-foreground flex h-8 items-center border-b text-xs font-medium" role="row">
      <div class="shrink-0 px-2" [style.width.px]="graphWidth()">Graph</div>
      <div class="min-w-0 flex-1 px-2">Message</div>
      <div class="w-40 shrink-0 px-2">Author</div>
      <div class="w-36 shrink-0 px-2">Date</div>
      <div class="w-20 shrink-0 px-2">ID</div>
    </div>

    <cdk-virtual-scroll-viewport [itemSize]="row" class="min-h-0 flex-1" role="grid" aria-label="Commit history">
      <div
        *cdkVirtualFor="let item of rows(); trackBy: trackHash"
        role="row"
        tabindex="0"
        class="hover:bg-muted/60 focus-visible:ring-ring flex cursor-default items-center text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-inset"
        [class.bg-accent]="git.selectedCommit()?.hash === item.c.hash"
        [class.border-t-2]="item.divider"
        [class.border-primary/50]="item.divider"
        [style.height.px]="row"
        [hlmContextMenuTrigger]="commitMenu"
        [hlmContextMenuTriggerData]="{ $implicit: item.c }"
        (click)="git.selectCommit(item.c)"
        (keydown.enter)="git.selectCommit(item.c)"
      >
        <div class="shrink-0 overflow-hidden" [style.width.px]="graphWidth()">
          @if (item.g) {
            <svg [attr.width]="graphWidth()" [attr.height]="row" aria-hidden="true">
              @for (l of item.g.lines; track $index) {
                <path
                  [attr.d]="path(l.x1, l.y1, l.x2, l.y2)"
                  [attr.stroke]="color(l.lane)"
                  stroke-width="2"
                  fill="none"
                />
              }
              <circle
                [attr.cx]="x(item.g.lane)"
                [attr.cy]="row / 2"
                [attr.r]="item.c.parents.length > 1 ? 3.5 : 4.5"
                [attr.fill]="item.c.parents.length > 1 ? color(item.g.lane) : 'var(--background)'"
                [attr.stroke]="color(item.g.lane)"
                stroke-width="2"
              />
            </svg>
          }
        </div>
        <div class="flex min-w-0 flex-1 items-center gap-1.5 px-2">
          @if (item.divider) {
            <span class="text-muted-foreground shrink-0 text-[10px] font-semibold uppercase tracking-wide">
              {{ item.sync === 'incoming' ? '↓ To pull' : item.sync === 'outgoing' ? '↑ To push' : 'Synced' }}
            </span>
          }
          @for (r of item.c.refs; track r) {
            <span
              hlmBadge
              [variant]="badgeVariant(r)"
              class="h-5 shrink-0 gap-1 px-2 text-[11px]"
              [style]="item.g && !r.startsWith('tag: ') ? badgeStyle(r, color(item.g.lane)) : null"
            >
              <ng-icon [name]="r.startsWith('tag: ') ? 'lucideTag' : 'lucideGitBranch'" size="11" />
              {{ badgeLabel(r) }}
            </span>
          }
          <span class="truncate" [title]="item.c.subject">{{ item.c.subject }}</span>
        </div>
        <div class="flex w-40 shrink-0 items-center gap-2 px-2" [title]="item.c.email">
          <span
            class="flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white"
            [style.background]="avatar(item.c.author)"
            aria-hidden="true"
          >
            {{ item.c.author.charAt(0).toUpperCase() }}
          </span>
          <span class="truncate">{{ item.c.author }}</span>
        </div>
        <div class="text-muted-foreground w-36 shrink-0 px-2 tabular-nums">
          {{ item.c.date | date: 'dd/MM/yyyy HH:mm' }}
        </div>
        <div class="text-muted-foreground w-20 shrink-0 px-2 font-mono text-xs">{{ item.c.hash.slice(0, 8) }}</div>
      </div>
    </cdk-virtual-scroll-viewport>

    <ng-template #commitMenu let-c>
      <hlm-dropdown-menu class="w-60">
        <button hlmDropdownMenuItem (triggered)="addTag(c)"><ng-icon name="lucideTag" />Add tag…</button>
        <button hlmDropdownMenuItem (triggered)="newBranch(c)">New branch here…</button>
        <button hlmDropdownMenuItem (triggered)="git.run(['switch', '--detach', c.hash], 'Checked out ' + c.hash.slice(0, 8))">
          Checkout (detached)
        </button>
        <hlm-dropdown-menu-separator />
        <button hlmDropdownMenuItem (triggered)="git.run(['cherry-pick', c.hash], 'Cherry-picked')">Cherry-pick</button>
        <button hlmDropdownMenuItem (triggered)="git.run(['revert', '--no-edit', c.hash], 'Reverted')">Revert</button>
        <hlm-dropdown-menu-separator />
        <button hlmDropdownMenuItem (triggered)="reset(c, 'mixed')">Reset here (keep changes)</button>
        <button hlmDropdownMenuItem variant="destructive" (triggered)="reset(c, 'hard')">Reset here (discard changes)…</button>
        <hlm-dropdown-menu-separator />
        <button hlmDropdownMenuItem (triggered)="copy(c.hash)">Copy commit ID</button>
      </hlm-dropdown-menu>
    </ng-template>
  `,
})
export class History {
  protected readonly git = inject(GitService);
  private readonly ask = injectAsk();
  protected readonly row = ROW;
  protected readonly filter = signal('');

  protected readonly graphWidth = computed(() => Math.min(this.git.graph().width, MAX_LANES) * LANE + 12);

  /** Graph rows only line up with the full list, so a filtered list hides the graph. */
  protected readonly rows = computed(() => {
    const f = this.filter().toLowerCase();
    const { rows } = this.git.graph();
    const sync = this.git.commitSync();
    const commits = this.git.commits();
    const all = commits.map((c, i) => ({
      c, g: f ? null : rows[i], sync: sync.get(c.hash),
      divider: !f && (i === 0 ? sync.has(c.hash) : sync.get(c.hash) !== sync.get(commits[i - 1].hash)),
    }));
    if (!f) return all;
    return all.filter(
      ({ c }) => c.subject.toLowerCase().includes(f) || c.author.toLowerCase().includes(f) || c.hash.startsWith(f),
    );
  });

  protected trackHash = (_: number, item: { c: Commit }) => item.c.hash;

  protected x(lane: number) {
    return lane * LANE + LANE / 2 + 4;
  }

  /** Straight for vertical segments, smooth curve when a line changes lane. */
  protected path(x1: number, y1: number, x2: number, y2: number) {
    const ax = this.x(x1), ay = y1 * ROW, bx = this.x(x2), by = y2 * ROW;
    if (ax === bx) return `M${ax} ${ay}L${bx} ${by}`;
    const my = (ay + by) / 2;
    return `M${ax} ${ay}C${ax} ${my} ${bx} ${my} ${bx} ${by}`;
  }

  protected color(lane: number) {
    return laneColor(lane);
  }

  protected avatar(name: string) {
    let h = 0;
    for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) | 0;
    return laneColor(Math.abs(h));
  }

  protected badgeLabel(r: string) {
    return r.replace(/^tag: /, '').replace(/^HEAD -> /, '');
  }

  protected badgeVariant(r: string) {
    if (r.startsWith('HEAD')) return 'default';
    if (r.startsWith('tag: ')) return 'secondary';
    return 'outline';
  }

  /** Branch badges take the color of their graph lane: solid for the checked-out branch, tinted otherwise. */
  protected badgeStyle(r: string, color: string) {
    return r.startsWith('HEAD')
      ? { background: color, borderColor: color, color: '#fff' }
      : { background: `color-mix(in oklab, ${color} 18%, transparent)`, borderColor: color };
  }

  protected async addTag(c: Commit) {
    const name = await this.ask({
      title: 'Add tag',
      description: `At ${c.hash.slice(0, 8)} ${c.subject}`,
      input: 'v1.0.0',
      confirm: 'Create tag',
    });
    if (typeof name === 'string' && name.trim()) await this.git.createTag(name.trim(), c.hash);
  }

  protected async newBranch(c: Commit) {
    const name = await this.ask({
      title: 'New branch',
      description: `At ${c.hash.slice(0, 8)} ${c.subject}`,
      input: 'branch-name',
      confirm: 'Create',
    });
    if (typeof name === 'string') await this.git.createBranch(name, c.hash);
  }

  protected async reset(c: Commit, mode: 'mixed' | 'hard') {
    const ok = await this.ask({
      title: `Reset ${this.git.branch()?.name} to ${c.hash.slice(0, 8)}?`,
      description:
        mode === 'hard'
          ? 'All uncommitted changes and later commits on this branch will be lost.'
          : 'Later commits are undone; their changes stay in the working tree.',
      confirm: 'Reset',
      destructive: mode === 'hard',
    });
    if (ok) await this.git.run(['reset', `--${mode}`, c.hash], 'Reset done');
  }

  protected async copy(text: string) {
    await navigator.clipboard.writeText(text);
    toast.success('Commit ID copied');
  }
}
