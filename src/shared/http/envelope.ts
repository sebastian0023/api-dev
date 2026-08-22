import { z } from "zod";

// The standard response shape every module's routes must return through.
// `envelope(schema)` wraps a resource schema for OpenAPI response docs so
// the generated spec matches what res.ok() actually sends.
export const MetaSchema = z.object({ requestId: z.string() });

export function envelope<T extends z.ZodType>(dataSchema: T) {
  return z.object({
    data: dataSchema,
    error: z.null(),
    meta: MetaSchema,
  });
}

export const ErrorEnvelopeSchema = z.object({
  data: z.null(),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
  meta: MetaSchema,
});
