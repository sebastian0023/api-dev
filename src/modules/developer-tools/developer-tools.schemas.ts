import { z } from "zod";
import { HASH_ALGORITHMS, HASH_OUTPUT_ENCODINGS } from "./domain/hashStrategy.js";
import { UUID_VERSIONS } from "./domain/uuidGenerator.js";
import { MAX_JWT_INPUT_BYTES, MAX_TEXT_INPUT_BYTES } from "./application/inputLimits.js";

// The shared JSON parser caps bodies at 2 MiB. Services enforce the stricter
// byte-level limits below so their expected 413 errors are preserved for
// valid JSON strings that exceed a tool's own budget.
const TextInput = z.string().max(MAX_TEXT_INPUT_BYTES * 2);

export const GenerateUuidBody = z.object({
  version: z.enum(UUID_VERSIONS).default("v4"),
  count: z.coerce.number().int().min(1).max(100).default(1),
});
export type GenerateUuidBody = z.infer<typeof GenerateUuidBody>;

export const GenerateUuidResource = z.object({
  version: z.enum(UUID_VERSIONS),
  count: z.number().int().min(1).max(100),
  values: z.array(z.uuid()),
});

export const HashBody = z.object({
  value: TextInput,
  algorithm: z.enum(HASH_ALGORITHMS).default("sha256"),
  encoding: z.enum(HASH_OUTPUT_ENCODINGS).default("hex"),
});
export type HashBody = z.infer<typeof HashBody>;

export const HashResource = z.object({
  algorithm: z.enum(HASH_ALGORITHMS),
  encoding: z.enum(HASH_OUTPUT_ENCODINGS),
  hash: z.string(),
});

export const Base64Body = z.object({ value: TextInput });
export type Base64Body = z.infer<typeof Base64Body>;

export const Base64EncodeResource = z.object({ encoding: z.literal("base64"), value: z.string() });
export const Base64DecodeResource = z.object({ encoding: z.literal("utf8"), value: z.string() });

export const DecodeJwtBody = z.object({ token: z.string().min(1).max(MAX_JWT_INPUT_BYTES * 2) });
export type DecodeJwtBody = z.infer<typeof DecodeJwtBody>;

const JwtJsonObject = z.record(z.string(), z.unknown());
export const DecodedJwtResource = z.object({
  header: JwtJsonObject,
  payload: JwtJsonObject,
  metadata: z.object({
    issuedAt: z.iso.datetime().nullable(),
    expiresAt: z.iso.datetime().nullable(),
    expired: z.boolean().nullable(),
  }),
});
