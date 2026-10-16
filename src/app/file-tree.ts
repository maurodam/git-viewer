interface Change { path: string }
export interface FileNode<T> {
  path: string;
  name: string;
  depth: number;
  file?: T;
  files: T[];
}

export function fileTree<T extends Change>(files: T[]): FileNode<T>[] {
  const folders = new Map<string, FileNode<T>>();
  const rows: FileNode<T>[] = [];
  for (const file of files) {
    const parts = file.path.split('/');
    for (let i = 1; i < parts.length; i++) {
      const path = parts.slice(0, i).join('/');
      let folder = folders.get(path);
      if (!folder) {
        folder = { path, name: parts[i - 1], depth: i - 1, files: [] };
        folders.set(path, folder);
        rows.push(folder);
      }
      folder.files.push(file);
    }
    rows.push({ path: file.path, name: parts.at(-1)!, depth: parts.length - 1, file, files: [file] });
  }
  return rows.sort((a, b) => {
    const left = a.path.split('/');
    const right = b.path.split('/');
    for (let i = 0; i < Math.min(left.length, right.length); i++) {
      const leftFolder = i < left.length - 1 || !a.file;
      const rightFolder = i < right.length - 1 || !b.file;
      if (leftFolder !== rightFolder) return leftFolder ? -1 : 1;
      const order = left[i].localeCompare(right[i]);
      if (order) return order;
    }
    return left.length - right.length;
  });
}

export function visiblePath(path: string, collapsed: ReadonlySet<string>): boolean {
  const parts = path.split('/');
  return parts.every((_, i) => i === 0 || !collapsed.has(parts.slice(0, i).join('/')));
}
