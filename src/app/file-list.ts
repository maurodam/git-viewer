import { NgTemplateOutlet } from '@angular/common';
import { Component, contentChild, input, output, TemplateRef } from '@angular/core';
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
  imports: [NgTemplateOutlet],
  template: `
    <ul class="text-[13px]">
      @for (f of files(); track f.path) {
        <li
          tabindex="0"
          class="group/row hover:bg-muted/60 focus-visible:ring-ring flex h-7 cursor-default items-center gap-2 rounded-lg px-2 outline-none focus-visible:ring-2"
          [title]="f.path"
          (click)="open.emit(f)"
          (keydown.enter)="open.emit(f)"
          (dblclick)="openTab.emit(f)"
        >
          <span class="shrink-0 truncate">{{ name(f.path) }}</span>
          <span class="text-muted-foreground min-w-0 flex-1 truncate text-xs">{{ dir(f.path) }}</span>
          @if (actions(); as tpl) {
            <span class="hidden shrink-0 gap-0.5 group-focus-within/row:flex group-hover/row:flex">
              <ng-container *ngTemplateOutlet="tpl; context: { $implicit: f }" />
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
    </ul>
  `,
})
export class FileList {
  readonly files = input.required<FileChange[]>();
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
