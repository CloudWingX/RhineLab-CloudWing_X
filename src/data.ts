import {
  albumCategories as validatedAlbumCategories,
  albums as validatedAlbums,
  labContent,
  musicTracks as validatedMusicTracks,
  type LabAlbumSlot,
  type LabMusicSlot,
  type LabSlot,
} from "./blog-adapter.ts";

export type ArchiveRecord = LabSlot;
/** 影像档案：一条记录 = 一个图集（与文章档案同处 records，靠 kind 区分）。 */
export type ArchiveAlbum = LabAlbumSlot;

export const records: ArchiveRecord[] = labContent.records;
/** 影像档案（图集）。不参与 columnFiles/fileLocation 的槽位计算。 */
export const albums: ArchiveAlbum[] = validatedAlbums;
/** 影像档案的两个大类（游戏影像 / 影像图集），顺序同数据源。 */
export const albumCategories: string[] = validatedAlbumCategories;
/** 音乐档案（一条 = 一首歌，与文章/影像档案同处 records，靠 kind 区分）。 */
export type ArchiveMusic = LabMusicSlot;
/** 音乐档案列表（阵列里的「音乐」列）；播放器本身只接单条记录。 */
export const musicTracks: ArchiveMusic[] = validatedMusicTracks;
// 列 = 5 个文章主题 + 影像大类（都由 lab-content.json 的 columns 决定，代码不写死列数）。
export const categories = ["全部档案", ...labContent.categories];
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
