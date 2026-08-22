import type { RenderHtmlPdfInput, RenderUrlPdfInput } from "./pdf.types.js";

/** Rendering port. Application code never imports a browser library. */
export interface PdfRenderer {
  renderHtml(input: RenderHtmlPdfInput): Promise<Buffer>;
  renderUrl(input: RenderUrlPdfInput): Promise<Buffer>;
}
