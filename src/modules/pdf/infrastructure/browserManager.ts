import { chromium, type Browser, type BrowserContext } from "playwright";
import {
  PdfCapacityExceededError,
  PdfNavigationTimeoutError,
  PdfRenderAbortedError,
  PdfRendererUnavailableError,
} from "../../pdf/domain/pdf.errors.js";

interface QueuedPermit {
  resolve: () => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  signal?: AbortSignal;
  onAbort?: () => void;
}

export class RenderGate {
  private active = 0;
  private readonly queue: QueuedPermit[] = [];

  constructor(
    private readonly maxActive: number,
    private readonly maxQueued: number,
    private readonly queueTimeoutMs: number,
  ) {}

  async acquire(signal?: AbortSignal): Promise<() => void> {
    if (signal?.aborted) throw new PdfRenderAbortedError();
    if (this.active < this.maxActive) {
      this.active += 1;
      return () => this.release();
    }
    if (this.queue.length >= this.maxQueued) throw new PdfCapacityExceededError();

    await new Promise<void>((resolve, reject) => {
      const waiter: QueuedPermit = {
        resolve,
        reject,
        timer: setTimeout(() => {
          this.remove(waiter);
          reject(new PdfCapacityExceededError("PDF render queue timed out"));
        }, this.queueTimeoutMs),
        signal,
      };
      if (signal) {
        waiter.onAbort = () => {
          this.remove(waiter);
          reject(new PdfRenderAbortedError());
        };
        signal.addEventListener("abort", waiter.onAbort, { once: true });
      }
      this.queue.push(waiter);
    });
    this.active += 1;
    return () => this.release();
  }

  private remove(waiter: QueuedPermit): void {
    const index = this.queue.indexOf(waiter);
    if (index >= 0) this.queue.splice(index, 1);
    clearTimeout(waiter.timer);
    if (waiter.signal && waiter.onAbort) waiter.signal.removeEventListener("abort", waiter.onAbort);
  }

  private release(): void {
    this.active -= 1;
    const waiter = this.queue.shift();
    if (!waiter) return;
    clearTimeout(waiter.timer);
    if (waiter.signal && waiter.onAbort) waiter.signal.removeEventListener("abort", waiter.onAbort);
    waiter.resolve();
  }
}

function withDeadline<T>(work: Promise<T>, timeoutMs: number, signal?: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new PdfNavigationTimeoutError()), timeoutMs);
    const onAbort = () => reject(new PdfRenderAbortedError());
    signal?.addEventListener("abort", onAbort, { once: true });
    work.then(resolve, reject).finally(() => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    });
  });
}

export class BrowserManager {
  private browser: Browser | undefined;
  private launchInFlight: Promise<Browser> | undefined;
  private readonly gate: RenderGate;

  constructor(opts: { maxConcurrent: number; maxQueued: number; queueTimeoutMs: number; renderTimeoutMs: number }) {
    this.gate = new RenderGate(opts.maxConcurrent, opts.maxQueued, opts.queueTimeoutMs);
    this.renderTimeoutMs = opts.renderTimeoutMs;
  }

  private readonly renderTimeoutMs: number;

  private async getBrowser(): Promise<Browser> {
    if (this.browser?.isConnected()) return this.browser;
    this.launchInFlight ??= chromium
      .launch({ headless: true, chromiumSandbox: true })
      .then((browser) => {
        browser.on("disconnected", () => {
          if (this.browser === browser) this.browser = undefined;
        });
        this.browser = browser;
        return browser;
      })
      .catch((err: unknown) => {
        throw new PdfRendererUnavailableError(err instanceof Error ? err.message : "Could not launch Chromium");
      })
      .finally(() => {
        this.launchInFlight = undefined;
      });
    return this.launchInFlight;
  }

  async withContext<T>(
    opts: { javaScriptEnabled: boolean; signal?: AbortSignal },
    work: (context: BrowserContext) => Promise<T>,
  ): Promise<T> {
    const release = await this.gate.acquire(opts.signal);
    let context: BrowserContext | undefined;
    try {
      const browser = await this.getBrowser();
      context = await browser.newContext({
        javaScriptEnabled: opts.javaScriptEnabled,
        acceptDownloads: false,
        serviceWorkers: "block",
        ignoreHTTPSErrors: false,
      });
      return await withDeadline(work(context), this.renderTimeoutMs, opts.signal);
    } finally {
      await context?.close().catch(() => {});
      release();
    }
  }

  async close(): Promise<void> {
    const browser = this.browser;
    this.browser = undefined;
    await browser?.close().catch(() => {});
  }
}
