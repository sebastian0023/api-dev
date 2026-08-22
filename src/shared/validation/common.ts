import { z } from "zod";

export const UuidParam = z.object({ id: z.uuid() });

export const PaginationQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});

export const SuccessResource = z.object({ success: z.literal(true) });
