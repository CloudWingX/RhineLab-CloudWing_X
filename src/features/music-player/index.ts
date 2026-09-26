/**
 * 音乐播放器功能模块的唯一对外入口。
 *
 * 边界（见 src/features/README.md 与 docs/FEATURES.md）：
 * - 本模块拥有：播放器浮层、播放/切曲/循环/音量控制、LRC 歌词同步、Blob 载入，
 *   以及"从 /lab/ 导航进入播放器"的全部集成逻辑。
 * - 本模块不拥有：档案选中状态、三维场景、终端音效与提示、环境背景音乐（stem）。
 *   这些能力通过下面的宿主端口按需借用，因此移除本模块不会牵动核心。
 * - 播放器代码与样式表按需加载，三维入口首屏不为它付费。
 */
import type { LabMusicSlot } from "../../blog-adapter";
import type { MusicPlayer } from "./player";

/** 档案详情里触发播放的按钮标记（由音乐档案的详情模板产出）。 */
export const MUSIC_ENTRY_SELECTOR = '[data-action="play-track"]';

export type { LabMusicSlot };

/** 宿主（三维档案应用）向播放器提供的最小能力集。 */
export interface MusicPlayerHost {
  /** 档案已就绪，入口可用。 */
  isArchiveReady(): boolean;
  /** 启动身份门仍占用屏幕时，任何入口都不得打开播放器。 */
  isIdentityGateActive(): boolean;
  /** 当前场景模式；离开档案后不再接受打开请求。 */
  currentMode(): "boot" | "archive" | "detail";
  /** 终端提示条。 */
  notify(message: string): void;
  /** 终端音效。 */
  playSound(name: "page-open" | "page-close" | "tick"): void;
  /** 播放器打开期间冻结三维输入（指针、滚轮、键盘）。 */
  setSceneInputSuspended(suspended: boolean): void;
  /**
   * 环境背景音乐（3 条循环 stem）的开关。打开播放器时传 false 让核心停掉它，
   * 关闭时传 true 恢复——否则两路声音会叠在一起。
   */
  setBackgroundMusic(enabled: boolean): void;
  /** 当前舞台缩放：浮层挂在 body 上、不在 #stage 里，需要自己乘上它才能与系统弹框等大。 */
  stageScale(): number;
}

/** DEV 审阅用的只读快照。 */
export interface MusicPlayerSnapshot {
  active: boolean;
  track: string | null;
  playing: boolean;
  moduleLoaded: boolean;
}

/** 核心通过这个门面使用播放器；核心不直接接触 MusicPlayer。 */
export interface MusicPlayerFeature {
  /** 播放器是否正在占用屏幕。 */
  isActive(): boolean;
  /** 事件是否发生在播放器子树内。 */
  ownsEvent(event: Event): boolean;
  /** 播放某条音乐档案；entry 用于关闭后归还焦点。 */
  open(
    track: LabMusicSlot,
    entry: HTMLElement | null,
    reduced: boolean,
    autoplay?: boolean,
  ): void;
  /** 上下文切换：静默关闭，不把焦点还给入口按钮。 */
  closeIfActive(): void;
  /** 先关闭播放器再执行动作（模态、重播、场景切换）。 */
  withClosed<T>(action: () => T | Promise<T>): Promise<T>;
  /** DEV 审阅快照。 */
  snapshot(): MusicPlayerSnapshot;
  /** HMR：不得留下第二个播放器或输入锁。 */
  dispose(): void;
}

export function createMusicPlayerFeature(host: MusicPlayerHost): MusicPlayerFeature {
  let player: MusicPlayer | null = null;
  let modulePending: Promise<MusicPlayer> | null = null;
  let opener: HTMLElement | null = null;
  let lastTrack: string | null = null;

  const isActive = (): boolean => player?.isActive === true;
  const ownsEvent = (event: Event): boolean => player?.ownsEvent(event) === true;

  async function ensure(): Promise<MusicPlayer> {
    if (player) return player;
    modulePending ??= (async () => {
      const [mod, styles] = await Promise.all([import("./player"), import("./styles")]);
      void styles;
      const instance = new mod.MusicPlayer({
        onClosed: () => {
          host.setSceneInputSuspended(false);
          // 关闭时把环境背景音乐还给用户（用户若在设置里关了，核心会自己尊重那个偏好）。
          host.setBackgroundMusic(true);
          const target = opener;
          opener = null;
          lastTrack = instance.currentTrackId;
          if (target && target.isConnected && document.contains(target)) {
            target.focus({ preventScroll: true });
          }
          host.playSound("page-close");
        },
        playSound: (name) => host.playSound(name),
        stageScale: () => host.stageScale(),
      });
      player = instance;
      return instance;
    })().catch((error) => {
      modulePending = null;
      throw error;
    });
    return modulePending;
  }

  function open(
    track: LabMusicSlot,
    entry: HTMLElement | null,
    reduced: boolean,
    autoplay = false,
  ): void {
    if (host.isIdentityGateActive() || !host.isArchiveReady()) return;
    if (host.currentMode() === "boot") return;
    void ensure()
      .then((instance) => {
        // await 之后重新确认归属：用户可能已经离开或又开了别的浮层。
        if (host.currentMode() === "boot") return;
        if (instance.isActive) return;
        if (!instance.open(track, reduced, autoplay)) {
          host.notify("这条音乐档案没有可播放的音源。");
          return;
        }
        opener = entry;
        lastTrack = track.id;
        host.setSceneInputSuspended(true);
        // 先把环境 stem 停掉，再开始播曲目。
        host.setBackgroundMusic(false);
        host.playSound("page-open");
      })
      .catch(() => {
        host.notify("音乐播放器加载失败。");
      });
  }

  function closeIfActive(): void {
    if (isActive()) void player?.close(false);
  }

  async function withClosed<T>(action: () => T | Promise<T>): Promise<T> {
    if (isActive()) await player?.close(false);
    return action();
  }

  function snapshot(): MusicPlayerSnapshot {
    return {
      active: isActive(),
      track: player?.currentTrackId ?? lastTrack,
      playing: player?.isPlaying ?? false,
      moduleLoaded: Boolean(player),
    };
  }

  function dispose(): void {
    player?.dispose();
    player = null;
    modulePending = null;
    opener = null;
  }

  // 页面隐藏 / bfcache：静默收起并交还背景音乐。
  const release = () => {
    if (isActive()) void player?.close(true);
  };
  window.addEventListener("pagehide", release);

  return { isActive, ownsEvent, open, closeIfActive, withClosed, snapshot, dispose };
}
