import { Component, effect, inject, signal } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideArrowDownToLine,
  lucideArrowUpFromLine,
  lucideChevronDown,
  lucideFileDiff,
  lucideFolderGit2,
  lucideFolderOpen,
  lucideHistory,
  lucideMonitor,
  lucideMoon,
  lucideRefreshCw,
  lucideRefreshCcwDot,
  lucideSun,
  lucideX,
} from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmDropdownMenuImports } from '@spartan-ng/helm/dropdown-menu';
import { HlmResizableImports } from '@spartan-ng/helm/resizable';
import { HlmToasterImports } from '@spartan-ng/helm/sonner';
import { HlmSpinnerImports } from '@spartan-ng/helm/spinner';
import { HlmTooltipImports } from '@spartan-ng/helm/tooltip';
import { Branches } from './branches';
import { Changes } from './changes';
import { Details } from './details';
import { DiffView } from './diff-view';
import { GitService } from './git.service';
import { History } from './history';

type Theme = 'light' | 'dark' | 'system';

function readTheme(): Theme {
  try {
    return (localStorage.getItem('theme') as Theme) ?? 'system';
  } catch {
    return 'system';
  }
}

@Component({
  selector: 'app-root',
  imports: [
    NgIcon,
    HlmButtonImports,
    HlmDropdownMenuImports,
    HlmResizableImports,
    HlmToasterImports,
    HlmSpinnerImports,
    HlmTooltipImports,
    Branches,
    History,
    Details,
    DiffView,
    Changes,
  ],
  providers: [
    provideIcons({
      lucideArrowDownToLine,
      lucideArrowUpFromLine,
      lucideChevronDown,
      lucideFileDiff,
      lucideFolderGit2,
      lucideFolderOpen,
      lucideHistory,
      lucideMonitor,
      lucideMoon,
      lucideRefreshCw,
      lucideRefreshCcwDot,
      lucideSun,
      lucideX,
    }),
  ],
  host: { class: 'flex h-screen flex-col bg-background text-foreground' },
  templateUrl: './app.html',
})
export class App {
  protected readonly git = inject(GitService);
  protected readonly theme = signal<Theme>(readTheme());
  private readonly media = matchMedia('(prefers-color-scheme: dark)');
  private readonly systemDark = signal(this.media.matches);

  constructor() {
    this.media.addEventListener('change', (e) => this.systemDark.set(e.matches));
    effect(() => {
      const t = this.theme();
      document.documentElement.classList.toggle('dark', t === 'dark' || (t === 'system' && this.systemDark()));
      try {
        localStorage.setItem('theme', t);
      } catch {
        // Theme choice is a convenience only.
      }
    });
  }

  protected cycleTheme() {
    this.theme.update((t) => (t === 'system' ? 'light' : t === 'light' ? 'dark' : 'system'));
  }

  protected themeIcon() {
    return { system: 'lucideMonitor', light: 'lucideSun', dark: 'lucideMoon' }[this.theme()];
  }
}
