import { archiveColumns, columnFiles, fileLocation } from "./data.ts";

export type ArchiveCell = { lane: number; row: number };
export type ArchiveNavigation =
  { axis: "row" | "lane"; direction: number } | { cell: ArchiveCell };

/** 阵列的内容列数（= lab-content.json 的 columns：文章主题 + 影像大类）。 */
export const CONTENT_COLUMNS = archiveColumns.length;
/**
 * 轮播泳道数 = 内容列 + 两侧各 2 条镜像列。
 * 镜像列由 `fileAtCell` 的 `wrap(lane, CONTENT_COLUMNS)` 映射回内容列，让阵列在
 * 可视区两侧无缝衔接（5 列时 = 9，与改造前的写死值一致）。
 */
export const LOOP_COLUMNS = CONTENT_COLUMNS + 4;
/** 内容列在泳道坐标里的中心：相机居中与拖拽换算都用它（5 列时 = 2）。 */
export const LANE_CENTER = (CONTENT_COLUMNS - 1) / 2;
export const LOOP_ROWS = 32;
export const COLUMN_SPACING = 5.2;
export const ROW_SPACING = 0.62;
// 泳道排布：先按顺序排内容列，再补两侧镜像列（左 -2/-1，右 C/C+1）。
// 前 CONTENT_COLUMNS × LOOP_ROWS 个实例因此仍是参考动画里那批内容列。
const POOL_LANES = [
  ...Array.from({ length: CONTENT_COLUMNS }, (_, lane) => lane),
  -2,
  -1,
  CONTENT_COLUMNS,
  CONTENT_COLUMNS + 1,
];

export function wrap(value: number, count: number) {
  return ((value % count) + count) % count;
}

// Choose an occurrence of an item in an unbounded sequence. Directional moves
// use adjacent cells instead, so the last-to-first transition never reverses.
export function nearestOccurrence(
  value: number,
  center: number,
  period: number,
) {
  return value + Math.floor((center - value + period / 2) / period) * period;
}

export function fileAtCell({ lane, row }: ArchiveCell) {
  const files = columnFiles(wrap(lane, archiveColumns.length));
  return files[wrap(row - 12, files.length)];
}

export function selectionCell(
  index: number,
  current: ArchiveCell,
  navigation?: ArchiveNavigation,
): ArchiveCell {
  if (navigation && "cell" in navigation) return { ...navigation.cell };
  const next = fileLocation(index);
  const row = nearestOccurrence(
    next.row,
    current.row,
    columnFiles(next.lane).length,
  );
  if (navigation?.axis === "row") {
    return { lane: current.lane, row: current.row + navigation.direction };
  }
  return {
    lane:
      navigation?.axis === "lane"
        ? current.lane + navigation.direction
        : nearestOccurrence(next.lane, current.lane, archiveColumns.length),
    row,
  };
}

// Preserve the reference animation's original first 160 instances. The four
// extra columns form a hidden margin on either side during interactive use.
export function poolCell(index: number): ArchiveCell {
  return {
    lane: POOL_LANES[Math.floor(index / LOOP_ROWS)],
    row: index % LOOP_ROWS,
  };
}

export function visibleCell(index: number, center: ArchiveCell): ArchiveCell {
  return {
    lane: nearestOccurrence(
      POOL_LANES[Math.floor(index / LOOP_ROWS)],
      center.lane,
      LOOP_COLUMNS,
    ),
    row: nearestOccurrence(index % LOOP_ROWS, center.row, LOOP_ROWS),
  };
}

export function cellKey(cell: ArchiveCell) {
  return `${cell.lane}:${cell.row}`;
}

export function sameCell(a: ArchiveCell, b: ArchiveCell) {
  return a.lane === b.lane && a.row === b.row;
}
