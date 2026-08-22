import { z } from "zod";

/** Reused by the HTTP schema and the application service. */
export const OriginalUrlSchema = z
  .string()
  .min(1)
  .max(4096)
  .url()
  .refine((value) => {
    try {
      const protocol = new URL(value).protocol;
      return protocol === "http:" || protocol === "https:";
    } catch {
      return false;
    }
  }, "URL protocol must be http or https");

export interface ShortUrl {
  id: string;
  shortCode: string;
  originalUrl: string;
  userId: string;
  clickCount: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date | null;
}

export interface CreateShortUrlRecord {
  shortCode: string;
  originalUrl: string;
  userId: string;
  createdAt: Date;
  expiresAt: Date | null;
}
