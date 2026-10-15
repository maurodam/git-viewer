export interface Commit {
  hash: string;
  parents: string[];
  author: string;
  email: string;
  date: number;
  refs: string[];
  subject: string;
}

/** A segment in lane units: x = lane index, y from 0 (row top) to 1 (row bottom), 0.5 = node. */
export interface Line {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  lane: number;
}

export interface GraphRow {
  lane: number;
  lines: Line[];
}

/** Assign every commit a lane and the line segments to draw in its row (input in topological order). */
export function buildGraph(commits: Commit[]): { rows: GraphRow[]; width: number } {
  let lanes: (string | null)[] = [];
  let width = 1;
  const rows = commits.map((c) => {
    // A branch tip nobody expects gets a free lane and no incoming line.
    let lane = lanes.indexOf(c.hash);
    if (lane < 0) lane = lanes.includes(null) ? lanes.indexOf(null) : lanes.length;
    const lines: Line[] = [];
    const before = lanes;
    lanes = before.map((h) => (h === c.hash ? null : h));
    while (lanes.length <= lane) lanes.push(null);

    before.forEach((h, j) => {
      if (h === c.hash) lines.push({ x1: j, y1: 0, x2: lane, y2: 0.5, lane: j });
      else if (h) lines.push({ x1: j, y1: 0, x2: j, y2: 1, lane: j });
    });

    // First parent keeps this lane (duplicates merge at the parent's row); others reuse or open a lane.
    c.parents.forEach((p, i) => {
      let k = i === 0 ? lane : lanes.indexOf(p);
      if (k < 0) {
        k = lanes.includes(null) ? lanes.indexOf(null) : lanes.length;
      }
      lanes[k] = p;
      lines.push({ x1: lane, y1: 0.5, x2: k, y2: 1, lane: i === 0 ? lane : k });
    });

    while (lanes.length && lanes[lanes.length - 1] === null) lanes.pop();
    width = Math.max(width, before.length, lanes.length, lane + 1);
    return { lane, lines };
  });
  return { rows, width };
}

const COLORS = ['#3b82f6', '#f59e0b', '#10b981', '#ec4899', '#8b5cf6', '#ef4444', '#06b6d4', '#84cc16'];

export function laneColor(lane: number) {
  return COLORS[lane % COLORS.length];
}
