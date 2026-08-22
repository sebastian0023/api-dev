export const PDF_FORMATS = ["A4", "Letter", "Legal"] as const;
export type PdfFormat = (typeof PDF_FORMATS)[number];

export interface PdfMargin {
  top: string;
  right: string;
  bottom: string;
  left: string;
}

export interface PdfOptions {
  format: PdfFormat;
  landscape: boolean;
  printBackground: boolean;
  margin: PdfMargin;
}

export interface RenderHtmlPdfInput {
  html: string;
  options: PdfOptions;
  signal?: AbortSignal;
}

export interface RenderUrlPdfInput {
  url: string;
  options: PdfOptions;
  signal?: AbortSignal;
}
