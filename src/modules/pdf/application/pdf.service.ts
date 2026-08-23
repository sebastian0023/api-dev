import { Buffer } from "node:buffer";
import { config } from "../../../core/config.js";
import type { Logger } from "../../../core/moduleContract.js";
import type { PdfRenderer } from "../../pdf/domain/pdfRenderer.js";
import type { PdfFormat, PdfMargin, PdfOptions } from "../../pdf/domain/pdf.types.js";
import {
  PdfInvalidUrlError,
  PdfRenderAbortedError,
  PdfRenderError,
  PdfTooLargeError,
} from "../../pdf/domain/pdf.errors.js";
import { DestinationPolicy } from "../../../shared/net/destinationPolicy.js";

export interface PdfOptionsInput {
  format?: PdfFormat;
  landscape?: boolean;
  printBackground?: boolean;
  margin?: Partial<PdfMargin>;
}

const DEFAULT_MARGIN: PdfMargin = { top: "0mm", right: "0mm", bottom: "0mm", left: "0mm" };

export function normalizePdfOptions(input: PdfOptionsInput | undefined): PdfOptions {
  return {
    format: input?.format ?? config.PDF_DEFAULT_FORMAT,
    landscape: input?.landscape ?? false,
    printBackground: input?.printBackground ?? true,
    margin: { ...DEFAULT_MARGIN, ...input?.margin },
  };
}

export function createPdfService(deps: { renderer: PdfRenderer; destinationPolicy: DestinationPolicy; logger: Logger }) {
  const { renderer, destinationPolicy, logger } = deps;

  async function renderHtml(input: { html: string; options?: PdfOptionsInput; signal?: AbortSignal }): Promise<Buffer> {
    if (Buffer.byteLength(input.html, "utf8") > config.PDF_HTML_MAX_BYTES) throw new PdfTooLargeError();
    return translate(() => renderer.renderHtml({ html: input.html, options: normalizePdfOptions(input.options), signal: input.signal }));
  }

  async function renderUrl(input: { url: string; options?: PdfOptionsInput; signal?: AbortSignal }): Promise<Buffer> {
    let url: URL;
    try {
      url = destinationPolicy.parseAndValidate(input.url);
    } catch (err) {
      if (err instanceof PdfInvalidUrlError) throw err;
      throw new PdfInvalidUrlError();
    }
    await destinationPolicy.assertAllowed(url);
    return translate(() => renderer.renderUrl({ url: url.toString(), options: normalizePdfOptions(input.options), signal: input.signal }));
  }

  async function translate(work: () => Promise<Buffer>): Promise<Buffer> {
    try {
      return await work();
    } catch (err) {
      if (err instanceof PdfRenderAbortedError) throw err;
      if (err instanceof Error && "statusCode" in err) throw err;
      logger.error("Unexpected PDF renderer failure");
      throw new PdfRenderError();
    }
  }

  return { renderHtml, renderUrl };
}

export type PdfService = ReturnType<typeof createPdfService>;
