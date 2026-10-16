import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideArrowUp,
  lucideCheck,
  lucideChevronRight,
  lucideCloud,
  lucideFolder,
  lucideGitBranch,
  lucideGitBranchPlus,
  lucideGitMerge,
  lucideGitPullRequestArrow,
  lucideHistory,
  lucideLogIn,
  lucideMonitor,
  lucideSearch,
  lucideTag,
  lucideTrash2,
} from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmContextMenuImports } from '@spartan-ng/helm/context-menu';
import { HlmDropdownMenuImports } from '@spartan-ng/helm/dropdown-menu';
import { HlmInputImports } from '@spartan-ng/helm/input';
import { injectAsk } from './ask-dialog';
import { GitService, type Ref } from './git.service';

interface Node {
  key: string;
  label: string;
  ref?: Ref;
  children: Node[];
}

/** Turn "feature/x/y" style names into a folder tree, folders first. */
function tree(prefix: string, refs: Ref[], cut = 0): Node[] {
  const root: Node = { key: prefix, label: '', children: [] };
  for (const ref of refs) {
    const parts = ref.name.split('/').slice(cut);
    let node = root;
    parts.forEach((part, i) => {
      const key = `${node.key}/${part}`;
      if (i === parts.length - 1) {
        node.children.push({ key, label: part, ref, children: [] });
        return;
      }
      let next = node.children.find((c) => c.key === key && !c.ref);
      if (!next) node.children.push((next = { key, label: part, children: [] }));
      node = next;
    });
  }
  const sort = (n: Node) => {
    n.children.sort((a, b) => Number(!!a.ref) - Number(!!b.ref) || a.label.localeCompare(b.label));
    n.children.forEach(sort);
  };
  sort(root);
  return root.children;
}

@Component({
  selector: 'app-branches',
  imports: [NgIcon, NgTemplateOutlet, HlmButtonImports, HlmInputImports, HlmContextMenuImports, HlmDropdownMenuImports],
  providers: [
    provideIcons({
      lucideArrowUp,
      lucideCheck,
      lucideChevronRight,
      lucideCloud,
      lucideFolder,
      lucideGitBranch,
      lucideGitBranchPlus,
      lucideGitMerge,
      lucideGitPullRequestArrow,
      lucideHistory,
      lucideLogIn,
      lucideMonitor,
      lucideSearch,
      lucideTag,
      lucideTrash2,
    }),
  ],
  host: { class: 'flex h-full flex-col bg-sidebar text-sidebar-foreground' },
  template: `
    <div class="relative p-2">
      <ng-icon name="lucideSearch" class="text-muted-foreground absolute top-1/2 left-4.5 -translate-y-1/2" size="14" />
      <input
        hlmInput
        class="h-8 ps-8 text-xs"
        placeholder="Filter branches"
        aria-label="Filter branches"
        [value]="filter()"
        (input)="filter.set($any($event.target).value)"
      />
    </div>

    <div class="min-h-0 flex-1 overflow-auto px-1 pb-4 text-[13px] select-none" role="tree" aria-label="Branches">
      @for (section of sections(); track section.key) {
        <ng-container *ngTemplateOutlet="nodeTpl; context: { $implicit: section, depth: 0 }" />
      }
    </div>

    <ng-template #nodeTpl let-node let-depth="depth">
      @if (node.ref; as ref) {
        <div
          role="treeitem"
          tabindex="0"
          class="group/branch hover:bg-sidebar-accent focus-visible:ring-ring flex h-7 cursor-default items-center gap-1.5 rounded-lg pe-2 outline-none focus-visible:ring-2"
          [class.bg-sidebar-accent]="isSelected(ref)"
          [style.padding-inline-start.px]="depth * 14 + 22"
          [title]="ref.name"
          [hlmContextMenuTrigger]="refMenu"
          [hlmContextMenuTriggerData]="{ $implicit: ref }"
          (click)="git.showHistory(ref.name)"
          (dblclick)="git.checkout(ref)"
          (keydown.enter)="git.showHistory(ref.name)"
        >
          <span class="relative flex size-3.5 shrink-0 items-center">
          <ng-icon
            [name]="ref.kind === 'tag' ? 'lucideTag' : 'lucideGitBranch'"
            size="14"
            class="shrink-0"
            [style.color]="ref.kind === 'tag' ? null : git.commitColors().get(ref.hash)"
          />
          @if (isSyncedWithOrigin(ref)) {
            <ng-icon name="lucideArrowUp" size="10" class="bg-sidebar absolute -right-1 -bottom-1 rounded-full text-emerald-500" aria-label="Synced with origin" title="Synced with origin" />
          }
          </span>
          <span class="truncate" [class.font-semibold]="ref.head">{{ node.label }}</span>
          @if (ref.head) {
            <ng-icon name="lucideCheck" size="13" class="text-emerald-500 shrink-0" aria-label="current branch" />
          }
          @if (ref.track) {
            <span class="text-muted-foreground ms-auto shrink-0 text-[11px] tabular-nums">{{ track(ref.track) }}</span>
          }
          @if (canDelete(ref)) {
            <button
              hlmBtn
              variant="ghost"
              size="icon-xs"
              class="hover:text-destructive shrink-0 opacity-0 group-focus-within/branch:opacity-100 group-hover/branch:opacity-100"
              [class.ms-auto]="!ref.track"
              [attr.aria-label]="'Delete ' + ref.name"
              (click)="$event.stopPropagation(); remove(ref)"
              (dblclick)="$event.stopPropagation()"
            >
              <ng-icon name="lucideTrash2" />
            </button>
          }
        </div>
      } @else {
        <div
          role="treeitem"
          tabindex="0"
          class="hover:bg-sidebar-accent focus-visible:ring-ring flex h-7 cursor-default items-center gap-1.5 rounded-lg pe-2 outline-none focus-visible:ring-2"
          [class.font-semibold]="depth === 0"
          [class.mt-2]="depth === 0"
          [style.padding-inline-start.px]="depth * 14 + 4"
          [attr.aria-expanded]="isOpen(node, depth)"
          (click)="toggle(node)"
          (keydown.enter)="toggle(node)"
        >
          <ng-icon
            name="lucideChevronRight"
            size="14"
            class="text-muted-foreground shrink-0 transition-transform"
            [class.rotate-90]="isOpen(node, depth)"
          />
          <ng-icon [name]="icon(node, depth)" size="14" class="text-muted-foreground shrink-0" />
          <span class="truncate">{{ node.label }}</span>
        </div>
        @if (isOpen(node, depth)) {
          <div role="group">
            @for (child of node.children; track child.key) {
              <ng-container *ngTemplateOutlet="nodeTpl; context: { $implicit: child, depth: depth + 1 }" />
            }
          </div>
        }
      }
    </ng-template>

    <ng-template #refMenu let-ref>
      <hlm-dropdown-menu class="w-56">
        @if (!ref.head) {
          <button hlmDropdownMenuItem (triggered)="git.checkout(ref)"><ng-icon name="lucideLogIn" />Checkout</button>
        }
        <button hlmDropdownMenuItem (triggered)="git.showHistory(ref.name)"><ng-icon name="lucideHistory" />View history</button>
        <button hlmDropdownMenuItem (triggered)="newBranch(ref)">
          <ng-icon name="lucideGitBranchPlus" />New branch from {{ ref.name }}…
        </button>
        @if (!ref.head) {
          <hlm-dropdown-menu-separator />
          <button hlmDropdownMenuItem (triggered)="merge(ref)">
            <ng-icon name="lucideGitMerge" />Merge into {{ git.branch()?.name }}
          </button>
          <button hlmDropdownMenuItem (triggered)="rebase(ref)">
            <ng-icon name="lucideGitPullRequestArrow" />Rebase {{ git.branch()?.name }} onto this
          </button>
        }
        @if (canDelete(ref)) {
          <hlm-dropdown-menu-separator />
          <button hlmDropdownMenuItem variant="destructive" (triggered)="remove(ref)">
            <ng-icon name="lucideTrash2" />{{ ref.kind === 'remote' ? 'Delete from remote…' : 'Delete…' }}
          </button>
        }
      </hlm-dropdown-menu>
    </ng-template>
  `,
})
export class Branches {
  protected readonly git = inject(GitService);
  private readonly ask = injectAsk();
  protected readonly filter = signal('');
  /** Keys whose open state differs from the default. */
  private readonly toggled = signal(new Set<string>());

  protected readonly sections = computed(() => {
    const f = this.filter().toLowerCase();
    const refs = this.git.refs().filter((r) => r.name.toLowerCase().includes(f));
    const of = (kind: Ref['kind']) => refs.filter((r) => r.kind === kind);
    return [
      { key: 'local', label: this.git.repoName() || 'Local', children: tree('local', of('local')) },
      { key: 'remote', label: 'Remotes', children: tree('remote', of('remote')) },
      { key: 'tags', label: 'Tags', children: tree('tags', of('tag')) },
    ] satisfies Node[];
  });

  protected isOpen(node: Node, depth: number) {
    if (this.filter()) return true;
    // Local tree and remote names start open; remote folders and tags start closed.
    const byDefault = node.key.startsWith('local') || depth < 2 && node.key !== 'tags';
    return byDefault !== this.toggled().has(node.key);
  }

  protected toggle(node: Node) {
    this.toggled.update((s) => {
      const next = new Set(s);
      if (!next.delete(node.key)) next.add(node.key);
      return next;
    });
  }

  protected icon(node: Node, depth: number) {
    if (depth > 0) return 'lucideFolder';
    return node.key === 'local' ? 'lucideMonitor' : node.key === 'remote' ? 'lucideCloud' : 'lucideTag';
  }

  protected isSelected(ref: Ref) {
    const sel = this.git.selectedRef();
    return !this.git.showAll() && (sel ? sel === ref.name : ref.head);
  }

  protected isSyncedWithOrigin(ref: Ref) {
    return ref.kind === 'local' && ref.upstream.startsWith('origin/') &&
      this.git.refs().some((remote) => remote.kind === 'remote' && remote.name === ref.upstream && remote.hash === ref.hash);
  }

  protected track(t: string) {
    if (t === '[gone]') return 'gone';
    const ahead = /ahead (\d+)/.exec(t)?.[1] ?? '0';
    const behind = /behind (\d+)/.exec(t)?.[1] ?? '0';
    return `↑${ahead} ↓${behind}`;
  }

  protected async newBranch(ref: Ref) {
    const name = await this.ask({ title: 'New branch', description: `From ${ref.name}`, input: 'branch-name', confirm: 'Create' });
    if (typeof name === 'string') await this.git.createBranch(name, ref.name);
  }

  protected async merge(ref: Ref) {
    const ok = await this.ask({ title: `Merge ${ref.name} into ${this.git.branch()?.name}?`, confirm: 'Merge' });
    if (ok) await this.git.run(['merge', ref.name], `Merged ${ref.name}`);
  }

  protected async rebase(ref: Ref) {
    const ok = await this.ask({ title: `Rebase ${this.git.branch()?.name} onto ${ref.name}?`, confirm: 'Rebase' });
    if (ok) await this.git.run(['rebase', ref.name], `Rebased onto ${ref.name}`);
  }

  /** Never the checked-out branch, nor the remote branch it tracks. */
  protected canDelete(ref: Ref) {
    if (ref.kind === 'local') return !ref.head;
    return ref.kind === 'remote' && ref.name !== this.git.branch()?.upstream;
  }

  protected async remove(ref: Ref) {
    if (!this.canDelete(ref)) return;
    if (ref.kind === 'remote') {
      const ok = await this.ask({
        title: `Delete ${ref.name} from the remote?`,
        description: 'The branch is removed on the server for everyone. Local branches are not touched.',
        confirm: 'Delete from remote',
        destructive: true,
      });
      if (ok) await this.git.deleteRemoteBranch(ref.name);
      return;
    }
    const ok = await this.ask({
      title: `Delete branch ${ref.name}?`,
      description: 'Unmerged branches are refused; the remote branch is not touched.',
      confirm: 'Delete',
      destructive: true,
    });
    if (!ok || (await this.git.deleteBranch(ref.name))) return;
    const force = await this.ask({
      title: `${ref.name} is not fully merged`,
      description: 'Force delete? Commits only on this branch will be lost.',
      confirm: 'Force delete',
      destructive: true,
    });
    if (force) await this.git.deleteBranch(ref.name, true);
  }
}
