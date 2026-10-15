import { DatePipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { DiffView } from './diff-view';
import { FileList } from './file-list';
import { type FileChange, GitService } from './git.service';

@Component({
  selector: 'app-details',
  imports: [DatePipe, DiffView, FileList],
  host: { class: 'flex h-full min-h-0 border-t' },
  template: `
    @if (git.selectedCommit(); as c) {
      <div class="flex w-80 shrink-0 flex-col overflow-auto border-e p-3 text-[13px]">
        <div class="font-semibold">{{ c.subject }}</div>
        @if (body(); as b) {
          <div class="text-muted-foreground mt-1 text-xs whitespace-pre-wrap">{{ b }}</div>
        }
        <dl class="text-muted-foreground mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          <dt>Author</dt>
          <dd class="text-foreground truncate" [title]="c.email">{{ c.author }} &lt;{{ c.email }}&gt;</dd>
          <dt>Date</dt>
          <dd class="text-foreground">{{ c.date | date: 'dd/MM/yyyy HH:mm:ss' }}</dd>
          <dt>Commit</dt>
          <dd class="text-foreground font-mono select-all">{{ c.hash }}</dd>
          <dt>Parents</dt>
          <dd class="text-foreground font-mono">
            @for (p of c.parents; track p) {
              <span class="me-2">{{ p.slice(0, 8) }}</span>
            }
          </dd>
        </dl>
        <div class="mt-4 mb-1 text-xs font-medium">Changed files ({{ git.commitFiles().length }})</div>
        <app-file-list [files]="git.commitFiles()" (open)="git.showCommitFileDiff($event)"
          (openTab)="openTab($event)"
        />
      </div>
    }

    <div class="flex min-w-0 flex-1 flex-col">
      @if (git.diff(); as d) {
        <app-diff-view [diff]="d" />
      } @else {
        <div class="text-muted-foreground flex flex-1 items-center justify-center text-sm">Select a file to see its changes</div>
      }
    </div>
  `,
})
export class Details {
  protected readonly git = inject(GitService);
  /** Commit message without the subject line already shown in bold. */
  protected async openTab(f: FileChange) {
    const d = await this.git.showCommitFileDiff(f);
    if (d) this.git.openTab(d);
  }

  protected readonly body = computed(() => this.git.commitBody().split('\n').slice(1).join('\n').trim());
}
