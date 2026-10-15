import type * as Monaco from 'monaco-editor';

declare global {
  interface Window {
    monaco: typeof Monaco;
    require: { config(c: object): void; (deps: string[], cb: () => void, err: (e: unknown) => void): void };
  }
}

let loading: Promise<typeof Monaco> | undefined;

/** Load the Monaco AMD build copied to /monaco/vs (see angular.json assets) once, on first diff. */
export function loadMonaco(): Promise<typeof Monaco> {
  return (loading ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'monaco/vs/loader.js';
    script.onerror = reject;
    script.onload = () => {
      window.require.config({ paths: { vs: 'monaco/vs' } });
      window.require(['vs/editor/editor.main'], () => resolve(window.monaco), reject);
    };
    document.body.appendChild(script);
  }));
}
