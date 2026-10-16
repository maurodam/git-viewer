import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, contentChild, input, model, output, signal, TemplateRef } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideChevronRight, lucideFolder, lucideUndo2 } from '@ng-icons/lucide';
import { fileTree, visiblePath } from './file-tree';
import type { FileChange } from './git.service';

const STATUS: Record<string, { label: string; cls: string }> = {
  M: { label: 'Modified', cls: 'text-amber-600 dark:text-amber-400' },
  A: { label: 'Added', cls: 'text-emerald-600 dark:text-emerald-400' },
  D: { label: 'Deleted', cls: 'text-red-600 dark:text-red-400' },
  R: { label: 'Renamed', cls: 'text-sky-600 dark:text-sky-400' },
  C: { label: 'Copied', cls: 'text-sky-600 dark:text-sky-400' },
  U: { label: 'Conflict', cls: 'text-red-600 dark:text-red-400 font-bold' },
  '?': { label: 'Untracked', cls: 'text-emerald-600 dark:text-emerald-400' },
};

/** File rows: name, dimmed folder, status letter; optional per-row actions via an <ng-template let-file>. */
@Component({
  selector: 'app-file-list',
  imports: [NgTemplateOutlet, NgIcon],
  providers: [provideIcons({ lucideChevronRight, lucideFolder, lucideUndo2 })],
  template: `
    <ul class="text-[13px]" [attr.role]="groupByFolder() ? 'tree' : null" [attr.aria-multiselectable]="groupByFolder() ? true : null" aria-label="Files">
      @for (node of rows(); track node.path) {
        @if (!node.file) {
          <li role="treeitem" [attr.aria-level]="node.depth + 1" [attr.aria-expanded]="!collapsed().has(node.path)" class="group/row flex h-7 items-center gap-1.5 rounded-lg hover:bg-muted/60" [style.padding-inline-start.px]="node.depth * 14 + 4">
            <button class="flex min-w-0 flex-1 items-center gap-1.5 text-left" [attr.aria-expanded]="!collapsed().has(node.path)" [title]="repoPath() + '/' + node.path" (click)="toggle(node.path)">
              <ng-icon name="lucideChevronRight" size="14" class="shrink-0 transition-transform" [class.rotate-90]="!collapsed().has(node.path)" />
              <ng-icon name="lucideFolder" size="14" class="text-muted-foreground shrink-0" />
              <span class="truncate">{{ node.name }}</span>
            </button>
            @if (canDiscardFolder()) {
              <button class="mr-2 flex size-6 items-center justify-center rounded hover:bg-muted opacity-0 group-hover/row:opacity-100 group-focus-within/row:opacity-100" [attr.aria-label]="'Discard changes in ' + node.path" title="Discard folder changes" (click)="discardFolder.emit(node.files)">
                <ng-icon name="lucideUndo2" size="14" />
              </button>
            }
          </li>
        } @else {
        @let f = node.file;
        <li
          tabindex="0"
          [attr.role]="groupByFolder() ? 'treeitem' : null"
          [attr.aria-level]="groupByFolder() ? node.depth + 1 : null"
          class="group/row hover:bg-muted/60 focus-visible:ring-ring flex h-7 cursor-default items-center gap-2 rounded-lg px-2 outline-none focus-visible:ring-2"
          [title]="f.path"
          [style.padding-inline-start.px]="groupByFolder() ? node.depth * 14 + 22 : 8"
          [class.bg-accent]="selected().has(f.path)"
          [attr.aria-selected]="groupByFolder() ? selected().has(f.path) : null"
          (click)="select($event, f)"
          (keydown.enter)="select($event, f)"
          (dblclick)="openTab.emit(f)"
        >
          <span class="shrink-0 truncate">{{ name(f.path) }}</span>
          <span class="text-muted-foreground min-w-0 flex-1 truncate text-xs">{{ groupByFolder() ? '' : dir(f.path) }}</span>
          @if (actions(); as tpl) {
            <span (keydown.enter)="$event.stopPropagation()" class="hidden shrink-0 gap-0.5 group-focus-within/row:flex group-hover/row:flex">
              <ng-container *ngTemplateOutlet="tpl; context: { $implicit: f, files: actionFiles(f) }" />
            </span>
          }
          <span
            class="w-4 shrink-0 text-center font-mono text-xs font-semibold"
            [class]="info(f).cls"
            [title]="info(f).label"
            [attr.aria-label]="info(f).label"
          >{{ f.status === '?' ? 'A' : f.status }}</span>
        </li>
        }
      }
    </ul>
  `,
})
export class FileList {
  readonly files = input.required<FileChange[]>();
  readonly groupByFolder = input(false);
  readonly repoPath = input('');
  readonly canDiscardFolder = input(false);
  readonly discardFolder = output<FileChange[]>();
  protected readonly collapsed = signal(new Set<string>());
  readonly selected = model(new Set<string>());
  protected readonly rows = computed(() => this.groupByFolder()
    ? fileTree(this.files()).filter((node) => visiblePath(node.path, this.collapsed()))
    : this.files().map((file) => ({ path: file.path, name: file.path, depth: 0, file, files: [file] })));

  protected toggle(path: string) {
    this.collapsed.update((value) => {
      const next = new Set(value);
      if (!next.delete(path)) next.add(path);
      return next;
    });
  }

  protected select(event: Event, file: FileChange) {
    if (this.groupByFolder()) {
      this.selected.update((value) => {
        const multiple = (event instanceof MouseEvent || event instanceof KeyboardEvent) && (event.ctrlKey || event.metaKey);
        const next = multiple ? new Set(value) : new Set<string>();
        if (!next.delete(file.path)) next.add(file.path);
        return next;
      });
    }
    this.open.emit(file);
  }

  protected actionFiles(file: FileChange) {
    return this.selected().has(file.path) ? this.files().filter((f) => this.selected().has(f.path)) : [file];
  }
  readonly open = output<FileChange>();
  readonly openTab = output<FileChange>();
  protected readonly actions = contentChild(TemplateRef);

  protected name(p: string) {
    return p.slice(p.lastIndexOf('/') + 1);
  }

  protected dir(p: string) {
    return p.slice(0, Math.max(0, p.lastIndexOf('/')));
  }

  protected info(f: FileChange) {
    return STATUS[f.status] ?? STATUS['M'];
  }
}
