import { z } from "zod";
import { PDF_FORMATS } from "./domain/pdf.types.js";

const CssLength = z.string().regex(/^\d+(?:\.\d+)?(?:mm|cm|in|px)$/, "Expected a non-negative CSS length");

export const PdfOptionsSchema = z.object({
  format: z.enum(PDF_FORMATS).optional(),
  landscape: z.boolean().optional(),
  printBackground: z.boolean().optional(),
  margin: z
    .object({
      top: CssLength.optional(),
      right: CssLength.optional(),
      bottom: CssLength.optional(),
      left: CssLength.optional(),
    })
    .optional(),
});

export const RenderHtmlPdfBody = z.object({
  html: z.string().min(1),
  options: PdfOptionsSchema.optional(),
});
export type RenderHtmlPdfBody = z.infer<typeof RenderHtmlPdfBody>;

export const RenderUrlPdfBody = z.object({
  url: z.string().min(1).max(2_048),
  options: PdfOptionsSchema.optional(),
});
export type RenderUrlPdfBody = z.infer<typeof RenderUrlPdfBody>;

export const PdfBinaryResponse = z.string().meta({ format: "binary", description: "Raw PDF bytes" });
