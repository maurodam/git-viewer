import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileTree, visiblePath } from './file-tree.ts';

test('nested tree orders folders before files and collects recursive undo targets', () => {
  const files = ['root.txt', 'src/z.ts', 'src/lib/a.ts', 'src2/keep.ts'].map((path) => ({ path }));
  const rows = fileTree(files);
  assert.deepEqual(rows.map((row) => row.path), ['src', 'src/lib', 'src/lib/a.ts', 'src/z.ts', 'src2', 'src2/keep.ts', 'root.txt']);
  assert.deepEqual(rows.find((row) => row.path === 'src')?.files, [files[1], files[2]]);
  assert.equal(rows.find((row) => row.path === 'src/lib/a.ts')?.depth, 2);
});

test('collapse hides only descendants and keeps nested collapse state', () => {
  const collapsed = new Set(['src', 'src/lib']);
  assert.equal(visiblePath('src', collapsed), true);
  assert.equal(visiblePath('src/lib/a.ts', collapsed), false);
  assert.equal(visiblePath('src2/a.ts', collapsed), true);
  collapsed.delete('src');
  assert.equal(visiblePath('src/lib', collapsed), true);
  assert.equal(visiblePath('src/lib/a.ts', collapsed), false);
  assert.deepEqual(fileTree([]), []);
});
