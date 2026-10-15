import { Component, inject, signal } from '@angular/core';
import { BrnDialogRef, injectBrnDialogContext } from '@spartan-ng/brain/dialog';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmDialogImports, HlmDialogService } from '@spartan-ng/helm/dialog';
import { HlmInputImports } from '@spartan-ng/helm/input';
import { firstValueFrom } from 'rxjs';

export interface AskOptions {
  title: string;
  description?: string;
  /** Long identifier (path, ref…) shown in monospace below the title, wrapped anywhere. */
  detail?: string;
  /** Show a text field with this placeholder; without it the dialog is a plain confirm. */
  input?: string;
  value?: string;
  confirm?: string;
  destructive?: boolean;
}

/** Shared prompt/confirm dialog: Electron has no window.prompt(). */
@Component({
  selector: 'app-ask-dialog',
  imports: [HlmDialogImports, HlmButtonImports, HlmInputImports],
  template: `
    <form class="grid gap-4" (submit)="$event.preventDefault(); ok()">
      <hlm-dialog-header>
        <h2 hlmDialogTitle class="leading-snug break-words">{{ ctx.title }}</h2>
        @if (ctx.description) {
          <p hlmDialogDescription class="break-words">{{ ctx.description }}</p>
        }
      </hlm-dialog-header>
      @if (ctx.detail) {
        <code class="bg-muted text-foreground block max-h-32 overflow-auto rounded-md px-3 py-2 font-mono text-xs break-all">{{
          ctx.detail
        }}</code>
      }
      @if (ctx.input !== undefined) {
        <input
          hlmInput
          autofocus
          [attr.aria-label]="ctx.title"
          [placeholder]="ctx.input"
          [value]="value()"
          (input)="value.set($any($event.target).value)"
        />
      }
      <hlm-dialog-footer>
        <button hlmBtn type="button" variant="outline" (click)="ref.close()">Cancel</button>
        <button
          hlmBtn
          type="submit"
          [variant]="ctx.destructive ? 'destructive' : 'default'"
          [disabled]="ctx.input !== undefined && !value().trim()"
        >
          {{ ctx.confirm ?? 'OK' }}
        </button>
      </hlm-dialog-footer>
    </form>
  `,
})
export class AskDialog {
  protected readonly ref = inject(BrnDialogRef);
  protected readonly ctx = injectBrnDialogContext<AskOptions>();
  protected readonly value = signal(this.ctx.value ?? '');

  protected ok() {
    this.ref.close(this.ctx.input !== undefined ? this.value().trim() : true);
  }
}

/** Resolves to the typed text (prompt), true (confirm) or undefined (cancelled). */
export function injectAsk() {
  const dialogs = inject(HlmDialogService);
  return (opts: AskOptions) =>
    firstValueFrom(dialogs.open(AskDialog, { context: opts, showCloseButton: false }).closed$) as Promise<string | true | undefined>;
}
