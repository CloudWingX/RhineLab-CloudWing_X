/**
 * 影像档案（图集）查看器功能模块的唯一对外入口。
 *
 * 边界（详见 src/features/README.md 与 docs/FEATURES.md）：
 * - 本模块拥有：查看器浮层、翻页与缩略图条、焦点与 inert 所有权，以及
 *   "从档案详情里的「查看详情」按钮进入查看器"的全部集成逻辑。
 * - 本模块不拥有：档案选中状态、三维场景、终端音效与提示。这些能力通过下面的
 *   宿主端口按需借用，因此移除本模块不会牵动核心。
 * - 查看器代码与其样式表按需加载，三维入口首屏 bundle 不为它付费。
 */
import type { AlbumViewer, AlbumViewerTarget } from "./viewer";

/** 详情面板里触发查看器的按钮标记（由影像档案详情模板产出）。 */
export const ALBUM_VIEWER_ENTRY_SELECTOR = '[data-action="open-album-viewer"]';

export type { AlbumViewerTarget };

/** 宿主（三维档案应用）向查看器提供的最小能力集。 */
export interface AlbumViewerHost {
  /** 档案已就绪，查看入口可用。 */
  isArchiveReady(): boolean;
  /** 启动身份门仍占用屏幕时，任何入口都不得打开查看器。 */
  isIdentityGateActive(): boolean;
  /** 当前场景模式；离开详情后不再接受打开请求。 */
  currentMode(): "boot" | "archive" | "detail";
  /** 终端提示条。 */
  notify(message: string): void;
  /** 终端音效。 */
  playSound(name: "page-open" | "page-close" | "tick"): void;
  /** 查看器打开期间冻结三维输入（指针、滚轮、键盘）。 */
  setSceneInputSuspended(suspended: boolean): void;
}

/** DEV 审阅用的只读快照。 */
export interface AlbumViewerSnapshot {
  active: boolean;
  album: string | null;
  index: number;
  moduleLoaded: boolean;
}

/** 核心通过这个门面使用查看器；核心不直接接触 AlbumViewer。 */
export interface AlbumViewerFeature {
  /** 查看器是否正在占用屏幕。 */
  isActive(): boolean;
  /** 事件是否发生在查看器子树内。 */
  ownsEvent(event: Event): boolean;
  /** 打开某个图集；入口元素用于关闭后归还焦点。 */
  open(target: AlbumViewerTarget, entry: HTMLElement | null, reduced: boolean): void;
  /** 上下文切换：静默关闭，不把焦点还给入口按钮。 */
  closeIfActive(): void;
  /** 先关闭查看器再执行动作（模态、重播、场景切换）。 */
  withClosed<T>(action: () => T | Promise<T>): Promise<T>;
  /** DEV 审阅快照。 */
  snapshot(): AlbumViewerSnapshot;
  /** HMR：不得留下第二个查看器或输入锁。 */
  dispose(): void;
}

export function createAlbumViewerFeature(host: AlbumViewerHost): AlbumViewerFeature {
  let viewer: AlbumViewer | null = null;
  let modulePending: Promise<AlbumViewer> | null = null;
  let opener: HTMLElement | null = null;
  let lastAlbum: string | null = null;
  let lastIndex = 0;

  const isActive = (): boolean => viewer?.isActive === true;
  const ownsEvent = (event: Event): boolean => viewer?.ownsEvent(event) === true;

  async function ensure(): Promise<AlbumViewer> {
    if (viewer) return viewer;
    modulePending ??= (async () => {
      const [mod, styles] = await Promise.all([import("./viewer"), import("./styles")]);
      void styles;
      const instance = new mod.AlbumViewer({
        onClosed: () => {
          host.setSceneInputSuspended(false);
          const target = opener;
          opener = null;
          lastIndex = instance.currentIndex;
          // 退出动画由查看器自己掌控；结束后再把焦点同步回入口按钮。
          if (target && target.isConnected && document.contains(target)) {
            target.focus({ preventScroll: true });
          }
          host.playSound("page-close");
        },
        playSound: (name) => host.playSound(name),
      });
      viewer = instance;
      return instance;
    })().catch((error) => {
      modulePending = null;
      throw error;
    });
    return modulePending;
  }

  function open(target: AlbumViewerTarget, entry: HTMLElement | null, reduced: boolean): void {
    if (host.isIdentityGateActive() || !host.isArchiveReady()) return;
    if (host.currentMode() !== "detail") return;
    void ensure()
      .then((instance) => {
        // await 之后重新确认归属：用户可能已离开详情，或已经打开了别的图集。
        if (host.currentMode() !== "detail") return;
        if (instance.isActive) return;
        if (!instance.open(target, reduced)) {
          host.notify("这个图集还没有影像。");
          return;
        }
        opener = entry;
        lastAlbum = target.id;
        lastIndex = 0;
        host.setSceneInputSuspended(true);
        host.playSound("page-open");
      })
      .catch(() => {
        host.notify("影像查看器加载失败。");
      });
  }

  function closeIfActive(): void {
    if (isActive()) void viewer?.close(false);
  }

  async function withClosed<T>(action: () => T | Promise<T>): Promise<T> {
    if (isActive()) await viewer?.close(false);
    return action();
  }

  function snapshot(): AlbumViewerSnapshot {
    return {
      active: isActive(),
      album: lastAlbum,
      index: viewer?.currentIndex ?? lastIndex,
      moduleLoaded: Boolean(viewer),
    };
  }

  function dispose(): void {
    viewer?.dispose();
    viewer = null;
    modulePending = null;
    opener = null;
  }

  // 页面隐藏 / bfcache：静默收起查看器，不留锁。
  const release = () => {
    if (isActive()) void viewer?.close(true);
  };
  window.addEventListener("pagehide", release);

  return { isActive, ownsEvent, open, closeIfActive, withClosed, snapshot, dispose };
}
