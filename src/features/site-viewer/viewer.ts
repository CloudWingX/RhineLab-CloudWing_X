/**
 * 网站导航（站点目录）浮层查看器。
 *
 * 与 `album-viewer` 同构、同一套表面：`<dialog>` 只是顶层透明容器，`.modal-backdrop` 提供遮罩
 * 与模糊，`.terminal-modal` 是窗口盒，进出动效来自共享的 `SurfaceTransition`。所以它不引入新的
 * 视觉语言，也不与三维场景争输入 —— 它挂在 `document.body` 上（`#stage` 之外），
 * 且不被打进三维入口首屏（见 index.ts 的懒加载）。
 *
 * 与影像查看器的差别只有内容：那边是逐张翻的图集，这边是**一张站点卡片墙**（没有翻页）。
 */
import type { SiteItem } from "../../blog-adapter";
import { escapeHtml } from "../../html";
import { SurfaceTransition } from "../../ui-transitions";

/** 门面向查看器提供的目标：一条「网站导航」档案 = 一个分组。 */
export interface SiteViewerTarget {
  id: string;
  title: string;
  category: string;
  hint: string;
  items: SiteItem[];
}

export interface SiteViewerOptions {
  /** 关闭完成后回调：焦点归还与音效由门面处理。 */
  onClosed: () => void;
  stageScale: () => number;
}

/** 没有图标时用站名首字拼一个圆牌（与旧站导航页同一做法）。 */
const mono = (value: string) => (String(value || "?").trim().charAt(0) || "?").toUpperCase();

export class SiteViewer {
  private dialog: HTMLDialogElement | null = null;
  private backdrop: HTMLElement | null = null;
  private grid: HTMLElement | null = null;
  private title: HTMLElement | null = null;
  private subtitle: HTMLElement | null = null;
  private position: HTMLElement | null = null;
  private transition: SurfaceTransition | null = null;
  private target: SiteViewerTarget | null = null;
  private closing = false;

  // 写成普通字段（不用参数属性），与 reader / album-viewer 一致：这样 Node 的 strip-only TS
  // 也能加载这个类做无浏览器的契约测试。
  private readonly options: SiteViewerOptions;

  constructor(options: SiteViewerOptions) {
    this.options = options;
    window.addEventListener("resize", () => {
      if (this.isActive) this.applyScale();
    });
  }

  private applyScale(): void {
    const scale = this.options.stageScale();
    this.dialog?.style.setProperty(
      "--sites-stage-scale",
      String(Number.isFinite(scale) && scale > 0 ? scale : 1),
    );
  }

  get isActive(): boolean {
    return this.dialog?.open === true;
  }

  ownsEvent(event: Event): boolean {
    return (
      event.target instanceof Element && Boolean(event.target.closest("dialog.site-viewer"))
    );
  }

  /** 打开某个分组的站点目录。空分组返回 false，由门面提示。 */
  open(target: SiteViewerTarget, reduced: boolean): boolean {
    if (!target.items.length) return false;
    this.mount();
    this.target = target;
    this.closing = false;
    const dialog = this.dialog!;
    if (!dialog.open) dialog.showModal();
    this.backdrop!.hidden = true;
    this.applyScale();
    this.render();
    this.transition!.show(reduced);
    dialog.focus({ preventScroll: true });
    return true;
  }

  /** 关闭；返回的 Promise 在退出动效结束、dialog 真正关闭后 resolve。 */
  close(reduced: boolean): Promise<void> {
    if (!this.isActive || this.closing) return Promise.resolve();
    this.closing = true;
    return new Promise<void>((resolve) => {
      let settled = false;
      const finalize = () => {
        if (settled) return;
        settled = true;
        this.closing = false;
        this.dialog?.close();
        this.target = null;
        this.options.onClosed();
        resolve();
      };
      this.transition!.hide(reduced, finalize);
      // 兜底：退出动效的完成回调来自 `animation.finished`。后台标签页、或被节流的合成器不推进
      // 动画时，这个回调可能永远不来，浮层就会冻结在屏幕上（无头环境实测如此）。
      window.setTimeout(finalize, reduced ? 0 : 600);
    });
  }

  dispose(): void {
    this.transition?.dispose();
    this.dialog?.remove();
    this.dialog = null;
    this.transition = null;
    this.target = null;
  }

  // ── 内部 ──────────────────────────────────────────────────────────────

  private mount(): void {
    if (this.dialog) return;
    const dialog = document.createElement("dialog");
    dialog.className = "site-viewer";
    dialog.setAttribute("aria-label", "网站导航");
    dialog.innerHTML = `
      <div class="modal-backdrop">
        <div class="sites-scale">
        <section class="terminal-modal sites-modal" role="document">
          <div class="modal-top"><span>CLOUDWING / SITE DIRECTORY</span><button data-sites-action="close" aria-label="关闭站点目录">CLOSE <span>×</span></button></div>
          <h2><span id="sites-title">分组</span><small id="sites-subtitle"></small></h2>
          <div id="sites-grid" class="sites-grid"></div>
          <div class="modal-bottom"><span id="sites-position"></span><span>SITE DIRECTORY <i>●</i> ONLINE</span></div>
        </section>
        </div>
      </div>`;
    dialog.addEventListener("click", (event) => this.onClick(event));
    // ESC：<dialog> 会先派发 cancel；接管它，让退出动效与手动关闭走同一条路。
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      this.close(false);
    });
    document.body.appendChild(dialog);

    this.dialog = dialog;
    this.backdrop = dialog.querySelector(".modal-backdrop")!;
    this.grid = dialog.querySelector("#sites-grid")!;
    this.title = dialog.querySelector("#sites-title")!;
    this.subtitle = dialog.querySelector("#sites-subtitle")!;
    this.position = dialog.querySelector("#sites-position")!;
    this.transition = new SurfaceTransition(
      this.backdrop,
      dialog.querySelector<HTMLElement>(".terminal-modal")!,
    );
  }

  private onClick(event: MouseEvent): void {
    const action = (event.target as HTMLElement)
      .closest<HTMLElement>("[data-sites-action]")?.dataset.sitesAction;
    if (action === "close") this.close(false);
    // 点窗口盒之外的遮罩空白处：关闭。（卡片本身是 <a>，点它不该关闭。）
    else if (!action && event.target === this.backdrop) this.close(false);
  }

  private render(): void {
    const target = this.target;
    if (!target || !this.grid) return;
    const total = target.items.length;
    this.title!.textContent = target.title;
    this.subtitle!.textContent = `${target.category} · 共 ${total} 个站点`;
    this.position!.textContent = `${String(total).padStart(3, "0")} SITES`;
    // ★图标与首字互斥★（旧站导航页的同一条约定）：有图标就只画图标、DOM 里不留首字 ——
    // CSS 无法感知背景图有没有加载成功，留着的首字会在图标透明处透出来，像两个图标叠在一起。
    this.grid.innerHTML = target.items
      .map(
        (item) => `<a class="site-card" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHtml(item.name)}（新标签打开）">
          <span class="site-mark"${item.icon ? ` style="--site-icon:url('${escapeHtml(item.icon)}')"` : ""} aria-hidden="true">${item.icon ? "" : escapeHtml(mono(item.name))}</span>
          <span class="site-main">
            <span class="site-row"><span class="site-name">${escapeHtml(item.name)}</span>${item.tag ? `<span class="site-tag">${escapeHtml(item.tag)}</span>` : ""}</span>
            ${item.desc ? `<span class="site-desc">${escapeHtml(item.desc)}</span>` : ""}
            ${item.host ? `<span class="site-host">${escapeHtml(item.host)}</span>` : ""}
          </span>
          <span class="site-go" aria-hidden="true">↗</span>
        </a>`,
      )
      .join("");
  }
}
