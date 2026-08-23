import { TextDecoder } from "node:util";
import type { DecodedJwt, JwtDecoder, JwtJsonObject } from "../../domain/jwtDecoder.js";
import { InvalidJwtEncodingError, InvalidJwtJsonError, InvalidJwtStructureError } from "../../domain/developer-tools.errors.js";

const UTF8_DECODER = new TextDecoder("utf-8", { fatal: true });
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]*$/;

function decodeBase64Url(segment: string): Buffer {
  if (!BASE64URL_PATTERN.test(segment) || segment.length % 4 === 1) throw new InvalidJwtEncodingError();
  const padding = "=".repeat((4 - (segment.length % 4)) % 4);
  const bytes = Buffer.from(segment.replace(/-/g, "+").replace(/_/g, "/") + padding, "base64");
  const canonical = bytes
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  if (canonical !== segment) throw new InvalidJwtEncodingError();
  return bytes;
}

function parseJsonObject(segment: string): JwtJsonObject {
  let text: string;
  try {
    text = UTF8_DECODER.decode(decodeBase64Url(segment));
  } catch (error) {
    if (error instanceof InvalidJwtEncodingError) throw error;
    throw new InvalidJwtEncodingError();
  }

  try {
    const value: unknown = JSON.parse(text);
    if (typeof value !== "object" || value === null || Array.isArray(value)) throw new InvalidJwtJsonError();
    return value as JwtJsonObject;
  } catch (error) {
    if (error instanceof InvalidJwtJsonError) throw error;
    throw new InvalidJwtJsonError();
  }
}

function numericDate(value: unknown): Date | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const date = new Date(value * 1_000);
  return Number.isNaN(date.getTime()) ? null : date;
}

export class StandardJwtDecoder implements JwtDecoder {
  constructor(private readonly now: () => Date = () => new Date()) {}

  decode(token: string): DecodedJwt {
    const segments = token.split(".");
    if (segments.length !== 3 || segments[0] === "" || segments[1] === "") throw new InvalidJwtStructureError();

    const encodedHeader = segments[0]!;
    const encodedPayload = segments[1]!;
    const encodedSignature = segments[2]!;
    const header = parseJsonObject(encodedHeader);
    const payload = parseJsonObject(encodedPayload);
    // Validate its encoding without interpreting it as evidence of authenticity.
    try {
      decodeBase64Url(encodedSignature);
    } catch (error) {
      if (error instanceof InvalidJwtEncodingError) throw error;
      throw new InvalidJwtEncodingError();
    }

    const issuedAt = numericDate(payload.iat);
    const expiresAt = numericDate(payload.exp);
    return {
      header,
      payload,
      metadata: {
        issuedAt: issuedAt?.toISOString() ?? null,
        expiresAt: expiresAt?.toISOString() ?? null,
        expired: expiresAt ? expiresAt.getTime() <= this.now().getTime() : null,
      },
    };
  }
}
