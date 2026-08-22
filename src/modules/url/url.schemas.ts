import { z } from "zod";
import { OriginalUrlSchema } from "./url.domain.js";

export function createCreateShortUrlBody(now: () => Date) {
  return z
    .object({
      url: OriginalUrlSchema,
      expiresAt: z.iso.datetime({ offset: true }).transform((value) => new Date(value)).optional(),
    })
    .superRefine(({ expiresAt }, ctx) => {
      if (expiresAt && expiresAt <= now()) {
        ctx.addIssue({ code: "custom", path: ["expiresAt"], message: "expiresAt must be in the future" });
      }
    });
}

export type CreateShortUrlBody = z.output<ReturnType<typeof createCreateShortUrlBody>>;

export const ShortCodeParam = z.object({ shortCode: z.string().regex(/^[0-9A-Za-z]{1,64}$/) });
export type ShortCodeParam = z.infer<typeof ShortCodeParam>;

export const ShortUrlResource = z.object({
  id: z.uuid(),
  shortCode: z.string().regex(/^[0-9A-Za-z]+$/),
  shortUrl: z.url(),
  originalUrl: OriginalUrlSchema,
  clickCount: z.number().int().nonnegative(),
  active: z.boolean(),
  expiresAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
