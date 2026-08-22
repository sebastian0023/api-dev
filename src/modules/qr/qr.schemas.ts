import { z } from "zod";

export const CreateQrBody = z.object({
  payload: z.string().min(1).max(2000),
  format: z.enum(["png", "svg"]),
  size: z.coerce.number().int().min(64).max(2000).optional(),
  errorCorrection: z.enum(["L", "M", "Q", "H"]).optional(),
  // 'redirect' encodes a link back to this API's own /:id/scan endpoint
  // (so scans are countable); 'static' encodes `payload` directly.
  mode: z.enum(["static", "redirect"]).default("static"),
});
export type CreateQrBody = z.infer<typeof CreateQrBody>;

export const IdParam = z.object({ id: z.uuid() });
export type IdParam = z.infer<typeof IdParam>;

export const ListQrQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListQrQuery = z.infer<typeof ListQrQuery>;

export const QrCodeResource = z.object({
  id: z.uuid(),
  payload: z.string(),
  format: z.enum(["png", "svg"]),
  mode: z.enum(["static", "redirect"]),
  size: z.number().int().nullable(),
  errorCorrection: z.string().nullable(),
  scanCount: z.number().int(),
  createdAt: z.iso.datetime(),
  image: z
    .string()
    .meta({ description: "PNG: data:image/png;base64,... URL. SVG: raw <svg> markup." }),
});

// The list endpoint omits the rendered image (regenerating N images per
// request is wasted work when only the detail view needs one).
export const QrCodeSummaryResource = QrCodeResource.omit({ image: true });
export const QrCodeSummaryListResource = z.array(QrCodeSummaryResource);
