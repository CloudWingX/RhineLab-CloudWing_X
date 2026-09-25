/**
 * 音乐播放器浮层。
 *
 * 表面与三个系统弹框（ARCHIVE INDEX / SAVED / SYSTEM）以及阅读层、影像查看器完全一致：
 * `<dialog>` 只是顶层透明容器，`.modal-backdrop` 提供遮罩与模糊，`.terminal-modal` 是窗口盒，
 * 进出动效来自共享的 `SurfaceTransition`。
 *
 * ★为什么用 Blob 播放★ CF Pages 的静态资产不支持 Range 请求，浏览器媒体栈会把 seek 钳回 0。
 * 这里在切曲时把整曲 `fetch` 成 Blob，再让 `audio.src` 指向 blob URL —— 本地 blob 天然可 seek，
 * 因此**不需要引入 Service Worker**（基座默认关闭 PWA）。代价是开始播放前要等整曲下载完。
 */
import type { MusicTrack } from "../../blog-adapter";
import { assetUrl } from "../../asset-url";
import { escapeHtml } from "../../html";
import { SurfaceTransition } from "../../ui-transitions";

export interface MusicPlayerOptions {
  /** 关闭完成后回调：BGM 恢复、焦点归还、音效由门面负责。 */
  onClosed: () => void;
  playSound: (name: "tick") => void;
  /**
   * 当前舞台缩放。浮层挂在 document.body 上、不在 #stage 里，因此不会被舞台的
   * transform 缩放；而 #stage 内的三个系统弹框是被缩放过的。要让两者视觉一致，
   * 浮层必须自己乘上这个比例（reader 也是这么做的）。
   */
  stageScale: () => number;
}

interface LyricLine {
  time: number;
  text: string;
}

const LOOP_MODES: { id: "list" | "single" | "shuffle"; label: string }[] = [
  { id: "list", label: "顺序循环" },
  { id: "single", label: "单曲循环" },
  { id: "shuffle", label: "随机播放" },
];

const ICON_PREV = `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 5v14M6 12l8-7M6 12l8 7"/></svg>`;
const ICON_NEXT = `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 5v14M18 12L10 5M18 12l-8 7"/></svg>`;
const ICON_PLAY = `<svg class="music-ico-play" viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"/></svg>`;
const ICON_PAUSE = `<svg class="music-ico-pause" viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M7.5 5h3.2v14H7.5zM13.3 5h3.2v14h-3.2z"/></svg>`;

const formatTime = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};

/** 标准 LRC：`[mm:ss.xx] 文本`，一行可有多个时间戳。 */
export function parseLrc(source: string): LyricLine[] {
  const lines: LyricLine[] = [];
  for (const raw of source.split(/\r?\n/)) {
    const stamps = [...raw.matchAll(/\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g)];
    if (!stamps.length) continue;
    const text = raw.replace(/\[[^\]]*\]/g, "").trim();
    if (!text) continue;
    for (const stamp of stamps) {
      const fraction = stamp[3] ? Number(`0.${stamp[3].padEnd(3, "0")}`) : 0;
      lines.push({
        time: Number(stamp[1]) * 60 + Number(stamp[2]) + fraction,
        text,
      });
    }
  }
  return lines.sort((a, b) => a.time - b.time);
}

export class MusicPlayer {
  private dialog: HTMLDialogElement | null = null;
  private backdrop: HTMLElement | null = null;
  private transition: SurfaceTransition | null = null;
  private audio: HTMLAudioElement | null = null;
  private tracks: MusicTrack[] = [];
  private index = 0;
  private loopMode: (typeof LOOP_MODES)[number]["id"] = "list";
  private lrcCache = new Map<string, LyricLine[]>();
  private lyrics: LyricLine[] = [];
  private activeLine = -1;
  private closing = false;
  private objectUrl: string | null = null;
  private loadToken = 0;
  private loadingTrack = false;
  /** Blob 方案失败时的原因（非空 = 已退化为直接指向资源）。DEV 诊断用。 */
  private blobFailed: string | null = null;
  private readonly options: MusicPlayerOptions;

  constructor(options: MusicPlayerOptions) {
    this.options = options;
    // 窗口尺寸变了舞台缩放就变，浮层开着时要跟着变。
    window.addEventListener("resize", () => {
      if (this.isActive) this.applyScale();
    });
  }

  /** 把舞台缩放写进浮层，使窗口盒与 #stage 里的三个系统弹框视觉一致。 */
  private applyScale(): void {
    const scale = this.options.stageScale();
    this.dialog?.style.setProperty(
      "--music-stage-scale",
      String(Number.isFinite(scale) && scale > 0 ? scale : 1),
    );
  }

  get isActive(): boolean {
    return this.dialog?.open === true;
  }

  get currentIndex(): number {
    return this.index;
  }

  get currentTrackId(): string | null {
    return this.tracks[this.index]?.id ?? null;
  }

  get isPlaying(): boolean {
    return Boolean(this.audio && !this.audio.paused);
  }

  ownsEvent(event: Event): boolean {
    return (
      event.target instanceof Element &&
      Boolean(event.target.closest("dialog.music-player"))
    );
  }

  open(tracks: MusicTrack[], reduced: boolean): boolean {
    if (!tracks.length) return false;
    this.mount();
    this.tracks = tracks;
    this.index = 0;
    this.closing = false;
    const dialog = this.dialog!;
    if (!dialog.open) dialog.showModal();
    this.backdrop!.hidden = true;
    this.applyScale();
    this.renderList();
    this.select(0, { autoplay: false });
    this.transition!.show(reduced);
    dialog.focus({ preventScroll: true });
    return true;
  }

  /** 关闭；返回的 Promise 在退出动效结束、dialog 真正关闭后 resolve。 */
  close(reduced: boolean): Promise<void> {
    if (!this.isActive || this.closing) return Promise.resolve();
    this.closing = true;
    this.pause();
    return new Promise<void>((resolve) => {
      let settled = false;
      const finalize = () => {
        if (settled) return;
        settled = true;
        this.closing = false;
        this.dialog?.close();
        this.options.onClosed();
        resolve();
      };
      this.transition!.hide(reduced, finalize);
      // 兜底：退出动效的完成回调来自 `animation.finished`，被节流的合成器可能永远不推进它，
      // 浮层会冻在屏幕上（无头环境实测如此）。给一个上限，到点强制收尾。
      window.setTimeout(finalize, reduced ? 0 : 600);
    });
  }

  dispose(): void {
    this.releaseTrack();
    this.transition?.dispose();
    this.dialog?.remove();
    this.dialog = null;
    this.transition = null;
    this.audio = null;
    this.tracks = [];
    this.lrcCache.clear();
  }

  // ── 播放控制 ──────────────────────────────────────────────────────────

  toggle(): void {
    if (this.loadingTrack) return;
    if (this.audio?.paused) void this.play();
    else this.pause();
  }

  private async play(): Promise<void> {
    if (!this.audio || this.loadingTrack) return;
    try {
      await this.audio.play();
    } catch {
      this.setStatus("无法播放这首曲目");
      return;
    }
    this.syncPlayIcon();
  }

  pause(): void {
    this.audio?.pause();
    this.syncPlayIcon();
  }

  step(delta: number): void {
    if (this.tracks.length < 2) return;
    if (this.loopMode === "shuffle") {
      let next = this.index;
      while (next === this.index) next = Math.floor(Math.random() * this.tracks.length);
      this.select(next, { autoplay: true });
      return;
    }
    const count = this.tracks.length;
    this.select((this.index + delta + count) % count, { autoplay: true });
  }

  private cycleLoop(): void {
    const at = LOOP_MODES.findIndex((m) => m.id === this.loopMode);
    this.loopMode = LOOP_MODES[(at + 1) % LOOP_MODES.length].id;
    const label = LOOP_MODES.find((m) => m.id === this.loopMode)!.label;
    this.$("#music-loop-label").textContent = label;
    this.renderParams();
    this.options.playSound("tick");
  }

  /** 切曲：更新 UI → 用 Blob 载入音频（可选自动播放）→ 载入歌词。 */
  private select(index: number, { autoplay }: { autoplay: boolean }): void {
    const track = this.tracks[index];
    if (!track) return;
    this.index = index;
    this.renderMeta(track);
    this.renderList();
    void this.loadLyrics(track);
    void this.loadTrack(track, autoplay);
    this.setStatus("正在载入…");
  }

  private releaseTrack(): void {
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
  }

  private async loadTrack(track: MusicTrack, autoplay: boolean): Promise<void> {
    const audio = this.audio;
    if (!audio) return;
    const token = ++this.loadToken;
    this.loadingTrack = true;
    this.releaseTrack();
    audio.pause();
    audio.removeAttribute("src");
    this.setProgress(0, 0);
    this.syncPlayIcon();
    try {
      const response = await fetch(assetUrl(track.src));
      if (!response.ok) throw new Error(String(response.status));
      // 用 arrayBuffer 自己造 Blob，而不是 response.blob()：后者在磁盘紧张的环境里
      // 会走浏览器的 Blob 存储路径并失败（实测沙箱里 172KB 可以、11.7MB 直接
      // "Failed to fetch"，而 arrayBuffer 能完整读到 11,687,227 字节）。
      const bytes = await response.arrayBuffer();
      if (token !== this.loadToken) return;
      this.objectUrl = URL.createObjectURL(new Blob([bytes], { type: "audio/mpeg" }));
      audio.src = this.objectUrl;
    } catch (error) {
      if (token !== this.loadToken) return;
      // 兜底：Blob 这条路走不通（取整曲失败、或浏览器不给建对象 URL）就直接指向资源本身。
      // 代价是失去"确定性 seek"，但保证还能播 —— 播放是这个功能的下限，不能因为它没声音。
      const reason = error instanceof Error ? error.message : String(error);
      this.objectUrl = null;
      audio.src = assetUrl(track.src);
      this.blobFailed = reason;
    }
    audio.load();
    if (token !== this.loadToken) return;
    this.loadingTrack = false;
    this.setStatus("就绪");
    if (autoplay) await this.play();
    else this.syncPlayIcon();
  }

  private async loadLyrics(track: MusicTrack): Promise<void> {
    const box = this.$("#music-lyrics-inner");
    this.lyrics = [];
    this.activeLine = -1;
    if (track.instrumental) {
      box.innerHTML = `<p class="music-lyrics-empty">纯音乐</p>`;
      this.renderParams();
      return;
    }
    const cached = this.lrcCache.get(track.id);
    if (cached) {
      this.lyrics = cached;
    } else {
      box.innerHTML = `<p class="music-lyrics-empty">正在载入歌词…</p>`;
      try {
        const response = await fetch(assetUrl(`music/lyrics/${track.id}.lrc`));
        if (!response.ok) throw new Error(String(response.status));
        const parsed = parseLrc(await response.text());
        this.lrcCache.set(track.id, parsed);
        if (this.currentTrackId !== track.id) return;
        this.lyrics = parsed;
      } catch {
        this.lyrics = [];
      }
    }
    if (this.currentTrackId !== track.id) return;
    box.innerHTML = this.lyrics.length
      ? this.lyrics.map((line) => `<p class="music-lyric" data-lrc>${escapeHtml(line.text)}</p>`).join("")
      : `<p class="music-lyrics-empty">这首歌没有可用歌词</p>`;
    this.renderParams();
    this.syncLyrics(this.audio?.currentTime ?? 0);
  }

  // ── 渲染 ─────────────────────────────────────────────────────────────

  private renderMeta(track: MusicTrack): void {
    this.$("#music-no").textContent = `${String(this.index + 1).padStart(2, "0")} / ${String(this.tracks.length).padStart(2, "0")}`;
    this.$("#music-title").textContent = track.title;
    this.$("#music-artist").textContent = track.artist;
    this.$("#music-album").textContent = track.album;
    const label = this.$("#music-label") as HTMLElement;
    label.style.backgroundImage = `url("${assetUrl(track.cover)}")`;
    (this.$("#music-disc") as HTMLElement).classList.toggle("is-spinning", this.isPlaying);
    this.renderParams();
    this.$(`#music-seek`).setAttribute("aria-valuetext", track.title);
  }

  private renderList(): void {
    const list = this.$("#music-list");
    list.innerHTML = this.tracks
      .map(
        (track, i) =>
          `<li><button type="button" class="music-item${i === this.index ? " active" : ""}" data-music-track="${i}" aria-current="${i === this.index}"><span class="music-item-no">${String(i + 1).padStart(2, "0")}</span><span class="music-item-cover" style="background-image:url(&quot;${assetUrl(track.cover)}&quot;)"></span><span class="music-item-main"><span class="music-item-title">${escapeHtml(track.title)}</span><span class="music-item-sub">${escapeHtml(track.artist)} · ${escapeHtml(track.album)}</span></span><span class="music-eq" aria-hidden="true"><i></i><i></i><i></i></span><span class="music-item-len">${formatTime(track.duration)}</span></button></li>`,
      )
      .join("");
    const disc = this.$("#music-disc") as HTMLElement;
    disc.classList.toggle("is-spinning", this.isPlaying);
  }

  private renderParams(): void {
    const track = this.tracks[this.index];
    if (!track) return;
    const loopLabel = LOOP_MODES.find((m) => m.id === this.loopMode)!.label;
    const volume = (this.$("#music-vol") as HTMLInputElement).value;
    const playing = this.isPlaying;
    const rows: [string, string][] = [
      ["播放状态", this.loadingTrack ? "载入中" : playing ? "播放中" : "已暂停"],
      ["当前曲目", `${String(this.index + 1).padStart(2, "0")} / ${String(this.tracks.length).padStart(2, "0")}`],
      ["格式 / 比特率", `MP3 · ${track.bitrate} kbps CBR`],
      ["时长", formatTime(track.duration)],
      ["文件大小", `${track.sizeMB} MB`],
      ["音源", track.origin],
      ["文件名", track.src.split("/").pop() ?? ""],
      ["循环模式", loopLabel],
      ["音量", `${volume}%`],
      ["歌词", track.instrumental ? "纯音乐" : this.lyrics.length ? `LRC 同步（${this.lyrics.length} 行）` : "无"],
    ];
    this.$("#music-params").innerHTML = rows
      .map(([key, value]) => `<div><dt>${key}</dt><dd>${escapeHtml(value)}</dd></div>`)
      .join("");
  }

  private syncPlayIcon(): void {
    const playing = this.isPlaying;
    this.dialog?.querySelectorAll<HTMLElement>("[data-music-icon]").forEach((node) => {
      node.hidden = node.dataset.musicIcon !== (playing ? "pause" : "play");
    });
    const toggle = this.$('[data-music-action="toggle"]');
    toggle.setAttribute("aria-label", playing ? "暂停" : "播放");
    (this.$("#music-disc") as HTMLElement).classList.toggle("is-spinning", playing);
    // 曲目表里当前项的波形只在"真的在播"时跳动。
    this.$(".music-modal")?.classList.toggle("is-playing", playing);
    this.$("#music-status").textContent = this.loadingTrack ? "正在载入…" : playing ? "播放中" : "已暂停";
  }

  private setStatus(text: string): void {
    this.$("#music-status").textContent = text;
    this.renderParams();
  }

  private setProgress(current: number, duration: number): void {
    const seek = this.$("#music-seek") as HTMLInputElement;
    const total = Number.isFinite(duration) && duration > 0 ? duration : (this.tracks[this.index]?.duration ?? 0);
    seek.max = String(total || 0);
    if (document.activeElement !== seek) seek.value = String(current || 0);
    this.$("#music-cur").textContent = formatTime(current);
    this.$("#music-dur").textContent = formatTime(total);
  }

  private syncLyrics(time: number): void {
    if (!this.lyrics.length) return;
    let index = -1;
    for (let i = 0; i < this.lyrics.length; i += 1) {
      if (this.lyrics[i].time <= time) index = i;
      else break;
    }
    if (index === this.activeLine) return;
    this.activeLine = index;
    const nodes = [...this.$("#music-lyrics-inner").querySelectorAll<HTMLElement>("[data-lrc]")];
    nodes.forEach((node, i) => node.classList.toggle("active", i === index));
    const active = nodes[index];
    if (active) {
      // 把当前行滚到歌词区中部附近；只滚歌词容器，不带动整页。
      const box = this.$("#music-lyrics-inner");
      const target = active.offsetTop - box.clientHeight / 2 + active.clientHeight / 2;
      box.scrollTo({ top: Math.max(0, target), behavior: "smooth" });
    }
  }

  // ── 装配 ─────────────────────────────────────────────────────────────

  private $(selector: string): HTMLElement {
    return this.dialog!.querySelector<HTMLElement>(selector)!;
  }

  private mount(): void {
    if (this.dialog) return;
    const dialog = document.createElement("dialog");
    dialog.className = "music-player";
    dialog.setAttribute("aria-label", "音乐播放器");
    dialog.innerHTML = `
      <div class="modal-backdrop">
        <div class="music-scale">
        <section class="terminal-modal music-modal" role="document">
          <div class="modal-top"><span>CLOUDWING / MUSIC</span><button type="button" data-music-action="close" aria-label="关闭播放器">CLOSE <span>×</span></button></div>
          <h2><span>音乐</span><small id="music-sub">四首常驻曲目 · 黑胶唱片 · 同步歌词</small></h2>
          <div class="music-body">
            <div class="music-left">
              <div class="music-disc" id="music-disc" aria-hidden="true">
                <div class="music-grooves"></div>
                <div class="music-label" id="music-label"></div>
                <div class="music-hole"></div>
              </div>
              <div class="music-lyrics">
                <p class="music-lyrics-title">LYRICS / 歌词</p>
                <div class="music-lyrics-inner" id="music-lyrics-inner"></div>
              </div>
            </div>
            <div class="music-right">
              <p class="music-no" id="music-no">01 / 04</p>
              <h3 class="music-title" id="music-title">—</h3>
              <p class="music-artist" id="music-artist"></p>
              <p class="music-album" id="music-album"></p>
              <input class="music-seek" id="music-seek" type="range" min="0" max="100" step="0.1" value="0" aria-label="播放进度" />
              <p class="music-times"><span id="music-cur">0:00</span><span id="music-dur">0:00</span></p>
              <div class="music-ctrl">
                <button type="button" class="music-btn" data-music-action="prev" aria-label="上一首">${ICON_PREV}</button>
                <button type="button" class="music-btn music-play" data-music-action="toggle" aria-label="播放"><span data-music-icon="play">${ICON_PLAY}</span><span data-music-icon="pause" hidden>${ICON_PAUSE}</span></button>
                <button type="button" class="music-btn" data-music-action="next" aria-label="下一首">${ICON_NEXT}</button>
                <button type="button" class="music-chip" data-music-action="loop" title="切换循环模式"><span id="music-loop-label">顺序循环</span></button>
                <label class="music-vol"><span>音量</span><input id="music-vol" type="range" min="0" max="100" value="100" aria-label="音量" /><output id="music-volpct">100%</output></label>
              </div>
              <section class="music-params"><h4>播放参数</h4><dl id="music-params"></dl></section>
              <section class="music-listwrap"><h4>曲目表</h4><ol class="music-list" id="music-list"></ol></section>
            </div>
          </div>
          <div class="modal-bottom"><span id="music-status">已暂停</span><span>曲目仅供站内欣赏 · 不随站点授权</span></div>
        </section>
        </div>
      </div>`;

    dialog.addEventListener("click", (event) => this.onClick(event));
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      void this.close(false);
    });
    dialog.addEventListener("input", (event) => this.onInput(event));
    dialog.addEventListener("keydown", (event) => this.onKeydown(event));
    document.body.appendChild(dialog);
    this.dialog = dialog;

    this.backdrop = dialog.querySelector(".modal-backdrop")!;
    this.transition = new SurfaceTransition(
      this.backdrop,
      dialog.querySelector<HTMLElement>(".terminal-modal")!,
    );

    const audio = new Audio();
    audio.preload = "auto";
    // 挂进文档：不挂也能播，但挂上之后它在文档里可被检查（调试与审阅都方便），
    // 且与"页面里手写一遍同样的播放流程"完全一致，少一处差异就少一个排查面。
    // 无 controls 属性的 audio 元素不占布局、不渲染任何东西。
    document.body.appendChild(audio);
    audio.addEventListener("timeupdate", () => this.setProgress(audio.currentTime, audio.duration));
    audio.addEventListener("loadedmetadata", () => {
      this.setProgress(audio.currentTime, audio.duration);
      this.renderParams();
    });
    audio.addEventListener("play", () => this.syncPlayIcon());
    audio.addEventListener("pause", () => this.syncPlayIcon());
    audio.addEventListener("ended", () => this.onEnded());
    audio.addEventListener("error", () => {
      if (this.loadingTrack) return;
      this.setStatus("播放出错");
    });
    this.audio = audio;
  }

  private onEnded(): void {
    if (this.loopMode === "single") {
      if (this.audio) this.audio.currentTime = 0;
      void this.play();
      return;
    }
    this.step(1);
  }

  private onClick(event: MouseEvent): void {
    const node = event.target as HTMLElement;
    const trackButton = node.closest<HTMLElement>("[data-music-track]");
    if (trackButton) {
      this.select(Number(trackButton.dataset.musicTrack), { autoplay: true });
      this.options.playSound("tick");
      return;
    }
    const action = node.closest<HTMLElement>("[data-music-action]")?.dataset.musicAction;
    if (!action) {
      if (event.target === this.backdrop) void this.close(false);
      return;
    }
    if (action === "close") void this.close(false);
    else if (action === "toggle") this.toggle();
    else if (action === "prev") this.step(-1);
    else if (action === "next") this.step(1);
    else if (action === "loop") this.cycleLoop();
  }

  private onInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    if (target.id === "music-seek" && this.audio) {
      // Blob 播放因此可以真正 seek（CF Pages 不支持 Range，这是绕开它的办法）。
      this.audio.currentTime = Number(target.value);
      this.setProgress(this.audio.currentTime, this.audio.duration);
      this.syncLyrics(this.audio.currentTime);
    } else if (target.id === "music-vol" && this.audio) {
      this.audio.volume = Number(target.value) / 100;
      this.$("#music-volpct").textContent = `${target.value}%`;
      this.renderParams();
    }
  }

  private onKeydown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement;
    if (target instanceof HTMLInputElement) return;
    if (event.code === "Space") {
      event.preventDefault();
      this.toggle();
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      if (this.audio) this.audio.currentTime = Math.max(0, this.audio.currentTime - 5);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      if (this.audio) {
        const max = Number.isFinite(this.audio.duration) ? this.audio.duration : this.audio.currentTime + 5;
        this.audio.currentTime = Math.min(max, this.audio.currentTime + 5);
      }
    }
  }
}
