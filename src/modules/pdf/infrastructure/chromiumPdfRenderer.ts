import type { BrowserContext, Page, Route } from "playwright";
import type { Logger } from "../../../core/moduleContract.js";
import type { PdfRenderer } from "../../pdf/domain/pdfRenderer.js";
import type { PdfOptions, RenderHtmlPdfInput, RenderUrlPdfInput } from "../../pdf/domain/pdf.types.js";
import { PdfBlockedDestinationError, PdfNavigationTimeoutError, PdfRenderError } from "../../pdf/domain/pdf.errors.js";
import { BrowserManager } from "./browserManager.js";
import { DestinationPolicy } from "./destinationPolicy.js";

function toBrowserOptions(options: PdfOptions) {
  return {
    format: options.format,
    landscape: options.landscape,
    printBackground: options.printBackground,
    margin: options.margin,
  } as const;
}

function safeHostname(value: string): string | undefined {
  try {
    return new URL(value).hostname;
  } catch {
    return undefined;
  }
}

/** Playwright adapter. No Playwright-specific types escape this file/folder. */
export class ChromiumPdfRenderer implements PdfRenderer {
  constructor(
    private readonly browserManager: BrowserManager,
    private readonly destinationPolicy: DestinationPolicy,
    private readonly logger: Logger,
    private readonly navigationTimeoutMs: number,
  ) {}

  async renderHtml(input: RenderHtmlPdfInput): Promise<Buffer> {
    return this.render("html", undefined, input.signal, input.options, async (context) => {
      const { page } = await this.createSecuredPage(context);
      await page.setContent(input.html, { waitUntil: "load", timeout: this.navigationTimeoutMs });
      return page.pdf(toBrowserOptions(input.options));
    });
  }

  async renderUrl(input: RenderUrlPdfInput): Promise<Buffer> {
    return this.render("url", safeHostname(input.url), input.signal, input.options, async (context) => {
      await this.destinationPolicy.assertAllowed(input.url);
      const securedPage = await this.createSecuredPage(context);
      try {
        await securedPage.page.goto(input.url, { waitUntil: "load", timeout: this.navigationTimeoutMs });
      } catch (err) {
        if (securedPage.blockedNavigation) throw securedPage.blockedNavigation;
        throw err;
      }
      if (securedPage.blockedNavigation) throw securedPage.blockedNavigation;
      return securedPage.page.pdf(toBrowserOptions(input.options));
    });
  }

  private async createSecuredPage(context: BrowserContext): Promise<{ page: Page; blockedNavigation?: PdfBlockedDestinationError }> {
    let blockedNavigation: PdfBlockedDestinationError | undefined;
    await context.route("**/*", async (route) => {
      const blocked = await this.guardRequest(route);
      if (blocked && route.request().isNavigationRequest()) blockedNavigation = blocked;
    });
    // URL documents may execute script, so stop websocket traffic outright.
    await context.routeWebSocket("**/*", (route) => route.close());
    return { page: await context.newPage(), get blockedNavigation() { return blockedNavigation; } };
  }

  private async guardRequest(route: Route): Promise<PdfBlockedDestinationError | undefined> {
    const requestUrl = route.request().url();
    try {
      const url = new URL(requestUrl);
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        await route.abort("blockedbyclient");
        return new PdfBlockedDestinationError("Browser request used an unsupported protocol");
      }
      await this.destinationPolicy.assertAllowed(url);
      await route.continue();
      return undefined;
    } catch (err) {
      await route.abort("blockedbyclient");
      if (err instanceof PdfBlockedDestinationError) return err;
      return undefined;
    }
  }

  private async render(
    type: "html" | "url",
    hostname: string | undefined,
    signal: AbortSignal | undefined,
    _options: PdfOptions,
    work: (context: BrowserContext) => Promise<Buffer>,
  ): Promise<Buffer> {
    const startedAt = Date.now();
    try {
      const pdf = await this.browserManager.withContext({ javaScriptEnabled: type === "url", signal }, work);
      this.logger.info("PDF render completed", { type, hostname, durationMs: Date.now() - startedAt });
      return pdf;
    } catch (err) {
      this.logger.warn("PDF render failed", { type, hostname, durationMs: Date.now() - startedAt });
      if (err instanceof PdfBlockedDestinationError || err instanceof PdfNavigationTimeoutError) throw err;
      if (err instanceof Error && err.name === "TimeoutError") throw new PdfNavigationTimeoutError();
      if (err instanceof Error && err.name === "PdfRenderAbortedError") throw err;
      if (err instanceof Error && "statusCode" in err) throw err;
      throw new PdfRenderError();
    }
  }
}
