/**
 * 网站导航（站点目录）浮层查看器功能模块的唯一对外入口。
 *
 * 边界（详见 src/features/README.md 与 docs/FEATURES.md）——与 album-viewer 同构：
 * - 本模块拥有：站点目录浮层、卡片墙、焦点与 inert 所有权，以及"从「网站导航」档案详情里的
 *   「浏览站点」按钮进入浮层"的全部集成逻辑。
 * - 本模块不拥有：档案选中状态、三维场景、终端音效与提示。这些能力通过下面的宿主端口按需借用，
 *   因此移除本模块不会牵动核心。
 * - 浮层代码与样式表按需加载，三维入口首屏 bundle 不为它付费。
 */
import type { SiteViewer, SiteViewerTarget } from "./viewer";

/** 详情面板里触发浮层的按钮标记（由「网站导航」档案的详情模板产出）。 */
export const SITE_VIEWER_ENTRY_SELECTOR = '[data-action="open-site-viewer"]';

export type { SiteViewerTarget };

/** 宿主（三维档案应用）向查看器提供的最小能力集。 */
export interface SiteViewerHost {
  /** 档案已就绪，入口可用。 */
  isArchiveReady(): boolean;
  /** 启动身份门仍占用屏幕时，任何入口都不得打开浮层。 */
  isIdentityGateActive(): boolean;
  /** 当前场景模式；离开详情后不再接受打开请求。 */
  currentMode(): "boot" | "archive" | "detail";
  /** 终端提示条。 */
  notify(message: string): void;
  /** 终端音效。 */
  playSound(name: "page-open" | "page-close" | "tick"): void;
  /** 浮层打开期间冻结三维输入（指针、滚轮、键盘）。 */
  setSceneInputSuspended(suspended: boolean): void;
  /** 当前舞台缩放：浮层挂在 body 上、不在 #stage 里，需要自己乘上它才能与系统弹框等大。 */
  stageScale(): number;
}

/** DEV 审阅用的只读快照。 */
export interface SiteViewerSnapshot {
  active: boolean;
  group: string | null;
  moduleLoaded: boolean;
}

/** 核心通过这个门面使用查看器；核心不直接接触 SiteViewer。 */
export interface SiteViewerFeature {
  /** 浮层是否正在占用屏幕。 */
  isActive(): boolean;
  /** 事件是否发生在浮层子树内。 */
  ownsEvent(event: Event): boolean;
  /** 打开某个分组的站点目录；入口元素用于关闭后归还焦点。 */
  open(target: SiteViewerTarget, entry: HTMLElement | null, reduced: boolean): void;
  /** 上下文切换：静默关闭，不把焦点还给入口按钮。 */
  closeIfActive(): void;
  /** 先关闭浮层再执行动作（模态、重播、场景切换）。 */
  withClosed<T>(action: () => T | Promise<T>): Promise<T>;
  /** DEV 审阅快照。 */
  snapshot(): SiteViewerSnapshot;
  /** HMR：不得留下第二个浮层或输入锁。 */
  dispose(): void;
}

export function createSiteViewerFeature(host: SiteViewerHost): SiteViewerFeature {
  let viewer: SiteViewer | null = null;
  let modulePending: Promise<SiteViewer> | null = null;
  let opener: HTMLElement | null = null;
  let lastGroup: string | null = null;

  const isActive = (): boolean => viewer?.isActive === true;
  const ownsEvent = (event: Event): boolean => viewer?.ownsEvent(event) === true;

  async function ensure(): Promise<SiteViewer> {
    if (viewer) return viewer;
    modulePending ??= (async () => {
      const [mod, styles] = await Promise.all([import("./viewer"), import("./styles")]);
      void styles;
      const instance = new mod.SiteViewer({
        onClosed: () => {
          host.setSceneInputSuspended(false);
          const target = opener;
          opener = null;
          // 退出动画由查看器自己掌控；结束后再把焦点同步回入口按钮。
          if (target && target.isConnected && document.contains(target)) {
            target.focus({ preventScroll: true });
          }
          host.playSound("page-close");
        },
        stageScale: () => host.stageScale(),
      });
      viewer = instance;
      return instance;
    })().catch((error) => {
      modulePending = null;
      throw error;
    });
    return modulePending;
  }

  function open(target: SiteViewerTarget, entry: HTMLElement | null, reduced: boolean): void {
    if (host.isIdentityGateActive() || !host.isArchiveReady()) return;
    if (host.currentMode() !== "detail") return;
    void ensure()
      .then((instance) => {
        // await 之后重新确认归属：用户可能已离开详情，或已经打开了别的分组。
        if (host.currentMode() !== "detail") return;
        if (instance.isActive) return;
        if (!instance.open(target, reduced)) {
          host.notify("这个分组还没有站点。");
          return;
        }
        opener = entry;
        lastGroup = target.title;
        host.setSceneInputSuspended(true);
        host.playSound("page-open");
      })
      .catch(() => {
        host.notify("站点目录加载失败。");
      });
  }

  function closeIfActive(): void {
    if (isActive()) void viewer?.close(false);
  }

  async function withClosed<T>(action: () => T | Promise<T>): Promise<T> {
    if (isActive()) await viewer?.close(false);
    return action();
  }

  function snapshot(): SiteViewerSnapshot {
    return { active: isActive(), group: lastGroup, moduleLoaded: Boolean(viewer) };
  }

  function dispose(): void {
    viewer?.dispose();
    viewer = null;
    modulePending = null;
    opener = null;
  }

  // 页面隐藏 / bfcache：静默收起浮层，不留锁。
  const release = () => {
    if (isActive()) void viewer?.close(true);
  };
  window.addEventListener("pagehide", release);

  return { isActive, ownsEvent, open, closeIfActive, withClosed, snapshot, dispose };
}
