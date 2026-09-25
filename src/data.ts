import {
  albumCategories as validatedAlbumCategories,
  albums as validatedAlbums,
  labContent,
  type LabAlbum,
  type LabSlot,
} from "./blog-adapter.ts";

export type ArchiveRecord = LabSlot;
/** 影像档案：一条记录 = 一个图集（不进三维阵列，见 blog-adapter.ts 的说明）。 */
export type ArchiveAlbum = LabAlbum;

export const records: ArchiveRecord[] = labContent.records;
/** 影像档案（图集）。不参与 columnFiles/fileLocation 的槽位计算。 */
export const albums: ArchiveAlbum[] = validatedAlbums;
/** 影像档案的两个大类（游戏影像 / 影像图集），顺序同数据源。 */
export const albumCategories: string[] = validatedAlbumCategories;
export const categories = [
  "全部档案",
  ...labContent.categories,
  ...albumCategories,
];
export const archiveColumns = labContent.columns;

export function columnFiles(lane: number) {
  return records
    .map((record, index) => ({ record, index }))
    .filter(({ record }) => record.category === archiveColumns[lane])
    .map(({ index }) => index);
}
export function fileLocation(index: number) {
  const lane = archiveColumns.indexOf(records[index].category);
  const row = 12 + columnFiles(lane).indexOf(index);
  return { lane, row, slot: lane * 32 + row };
}
export function fileAtSlot(slot: number) {
  const files = columnFiles(Math.floor(slot / 32));
  return files[Math.max(0, Math.min(files.length - 1, (slot % 32) - 12))];
}
