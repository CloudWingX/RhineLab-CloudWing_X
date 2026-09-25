/**
 * 影像档案（图集）的居中浮层查看器。
 *
 * 表面与三个系统弹框（ARCHIVE INDEX / SAVED / SYSTEM）以及阅读层完全一致：
 * `<dialog>` 只是顶层透明容器，`.modal-backdrop` 提供遮罩与模糊，`.terminal-modal`
 * 是窗口盒，进出动效来自共享的 `SurfaceTransition`。因此本模块不引入新的视觉语言，
 * 也不与三维场景争夺输入——它挂在 `document.body` 上（`#stage` 之外），
 * 不会被打包进三维入口首屏（见 index.ts 的懒加载）。
 */
import type { AlbumImage } from "../../blog-adapter";
import { SurfaceTransition } from "../../ui-transitions";

/** 门面向查看器提供的目标：一条影像档案 = 一个图集。 */
export interface AlbumViewerTarget {
  id: string;
  title: string;
  category: string;
  images: AlbumImage[];
}

export interface AlbumViewerOptions {
  /** 关闭完成后回调：焦点归还与音效由门面处理。 */
  onClosed: () => void;
  playSound: (name: "tick") => void;
  /**
   * 当前舞台缩放。浮层挂在 document.body 上、不在 #stage 里，因此不会被舞台的 transform 缩放，
   * 而 #stage 里的三个系统弹框是被缩放过的 —— 要视觉一致就得自己乘上它。
   */
  stageScale: () => number;
}

const ICON_PREV = "←";
const ICON_NEXT = "→";

export class AlbumViewer {
  private dialog: HTMLDialogElement | null = null;
  private backdrop: HTMLElement | null = null;
  private frame: HTMLImageElement | null = null;
  private caption: HTMLElement | null = null;
  private position: HTMLElement | null = null;
  private strip: HTMLElement | null = null;
  private title: HTMLElement | null = null;
  private subtitle: HTMLElement | null = null;
  private prevButton: HTMLButtonElement | null = null;
  private nextButton: HTMLButtonElement | null = null;
  private transition: SurfaceTransition | null = null;
  private target: AlbumViewerTarget | null = null;
  private index = 0;
  private closing = false;

  // 写成普通字段（不用参数属性），与 reader 一致：这样 Node 的 strip-only TS
  // 也能加载这个类做无浏览器的契约测试。
  private readonly options: AlbumViewerOptions;

  constructor(options: AlbumViewerOptions) {
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
      "--album-stage-scale",
      String(Number.isFinite(scale) && scale > 0 ? scale : 1),
    );
  }

  get isActive(): boolean {
    return this.dialog?.open === true;
  }

  get currentIndex(): number {
    return this.index;
  }

  ownsEvent(event: Event): boolean {
    return (
      event.target instanceof Element &&
      Boolean(event.target.closest("dialog.album-viewer"))
    );
  }

  /** 打开某个图集。空图集返回 false，由门面提示。 */
  open(target: AlbumViewerTarget, reduced: boolean): boolean {
    if (!target.images.length) return false;
    this.mount();
    this.target = target;
    this.index = 0;
    this.closing = false;
    const dialog = this.dialog!;
    if (!dialog.open) dialog.showModal();
    this.backdrop!.hidden = true;
    this.applyScale();
    this.render(true);
    this.transition!.show(reduced);
    dialog.focus({ preventScroll: true });
    return true;
  }

  /** 关闭查看器；返回的 Promise 在退出动效结束、dialog 真正关闭后 resolve。 */
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
      // 兜底：退出动效的完成回调来自 `animation.finished`。后台标签页、或被节流的
      // 合成器不推进动画时，这个回调可能永远不来，浮层就会冻结在屏幕上。给一个上限，
      // 到点强制收尾（正常浏览器里 200ms 的动效会先完成，这里不会生效）。
      window.setTimeout(finalize, reduced ? 0 : 600);
    });
  }

  dispose(): void {
    this.transition?.dispose();
    this.dialog?.remove();
    this.dialog = null;
    this.transition = null;
    this.target = null;
    this.index = 0;
  }

  // ── 内部 ──────────────────────────────────────────────────────────────

  private mount(): void {
    if (this.dialog) return;
    const dialog = document.createElement("dialog");
    dialog.className = "album-viewer";
    dialog.setAttribute("aria-label", "影像档案");
    dialog.innerHTML = `
      <div class="modal-backdrop">
        <div class="album-scale">
        <section class="terminal-modal album-modal" role="document">
          <div class="modal-top"><span>CLOUDWING / IMAGE ARCHIVE</span><button data-album-action="close" aria-label="关闭查看器">CLOSE <span>×</span></button></div>
          <h2><span id="album-viewer-title">图集</span><small id="album-viewer-subtitle"></small></h2>
          <div class="album-stage">
            <button class="album-nav" data-album-action="prev" aria-label="上一张">${ICON_PREV}</button>
            <figure class="album-frame">
              <img id="album-viewer-image" alt="" decoding="async" />
              <figcaption id="album-viewer-caption"></figcaption>
            </figure>
            <button class="album-nav" data-album-action="next" aria-label="下一张">${ICON_NEXT}</button>
          </div>
          <div id="album-viewer-strip" class="album-strip" role="tablist" aria-label="图集缩略图"></div>
          <div class="modal-bottom"><span id="album-viewer-position"></span><span>IMAGE ARCHIVE <i>●</i> ONLINE</span></div>
        </section>
        </div>
      </div>`;
    dialog.addEventListener("click", (event) => this.onClick(event));
    // ESC：<dialog> 会先派发 cancel；接管它，好让退出动效与手动关闭走同一条路。
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      this.close(false);
    });
    dialog.addEventListener("keydown", (event) => this.onKeydown(event));
    document.body.appendChild(dialog);

    this.dialog = dialog;
    this.backdrop = dialog.querySelector(".modal-backdrop")!;
    this.frame = dialog.querySelector("#album-viewer-image")!;
    this.caption = dialog.querySelector("#album-viewer-caption")!;
    this.position = dialog.querySelector("#album-viewer-position")!;
    this.strip = dialog.querySelector("#album-viewer-strip")!;
    this.title = dialog.querySelector("#album-viewer-title")!;
    this.subtitle = dialog.querySelector("#album-viewer-subtitle")!;
    this.prevButton = dialog.querySelector('[data-album-action="prev"]')!;
    this.nextButton = dialog.querySelector('[data-album-action="next"]')!;
    this.transition = new SurfaceTransition(
      this.backdrop,
      dialog.querySelector<HTMLElement>(".terminal-modal")!,
    );
  }

  private onClick(event: MouseEvent): void {
    const node = event.target as HTMLElement;
    const action = node.closest<HTMLElement>("[data-album-action]")?.dataset.albumAction;
    if (!action) {
      // 点窗口盒之外的遮罩空白处：关闭。
      if (event.target === this.backdrop) this.close(false);
      return;
    }
    if (action === "close") {
      this.close(false);
      return;
    }
    if (action === "prev") {
      this.step(-1);
      return;
    }
    if (action === "next") {
      this.step(1);
      return;
    }
    const thumb = node.closest<HTMLElement>("[data-album-index]");
    if (thumb?.dataset.albumIndex !== undefined) this.jump(Number(thumb.dataset.albumIndex));
  }

  private onKeydown(event: KeyboardEvent): void {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      this.step(-1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      this.step(1);
    } else if (event.key === "Home") {
      event.preventDefault();
      this.jump(0);
    } else if (event.key === "End") {
      event.preventDefault();
      this.jump((this.target?.images.length ?? 1) - 1);
    }
  }

  private step(delta: number): void {
    const total = this.target?.images.length ?? 0;
    if (total < 2) return;
    this.jump((this.index + delta + total) % total);
  }

  private jump(index: number): void {
    if (index === this.index) return;
    this.index = index;
    this.render(false);
    this.options.playSound("tick");
  }

  private render(first: boolean): void {
    const target = this.target;
    if (!target || !this.frame) return;
    const total = target.images.length;
    const current = target.images[this.index];
    this.frame.src = current.src;
    this.frame.alt = current.title || `${target.title} 第 ${this.index + 1} 张`;
    this.caption!.textContent = current.date
      ? `${current.date} · ${this.index + 1} / ${total}`
      : `${this.index + 1} / ${total}`;
    this.position!.textContent = `${String(this.index + 1).padStart(3, "0")} / ${String(total).padStart(3, "0")}`;
    this.title!.textContent = target.title;
    this.subtitle!.textContent = `${target.category} · 共 ${total} 张`;

    const single = total < 2;
    this.prevButton!.disabled = single;
    this.nextButton!.disabled = single;

    if (first) {
      // 缩略图条只在打开时构建一次；翻页只改 active，不重建 DOM。
      this.strip!.innerHTML = target.images
        .map(
          (image, index) =>
            `<button role="tab" data-album-index="${index}" aria-selected="${index === 0}" aria-label="第 ${index + 1} 张${image.date ? `，${image.date}` : ""}" class="${index === 0 ? "active" : ""}"><img src="${image.src}" alt="" loading="lazy" decoding="async" /></button>`,
        )
        .join("");
      return;
    }
    this.strip!.querySelectorAll<HTMLElement>("[data-album-index]").forEach((node) => {
      const active = Number(node.dataset.albumIndex) === this.index;
      node.classList.toggle("active", active);
      node.setAttribute("aria-selected", String(active));
    });
  }
}
