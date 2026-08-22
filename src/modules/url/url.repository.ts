import type { CreateShortUrlRecord, ShortUrl } from "./url.domain.js";

/** Persistence boundary for the URL application service. */
export interface ShortUrlRepository {
  create(data: CreateShortUrlRecord): Promise<ShortUrl>;
  existsByCode(shortCode: string): Promise<boolean>;
  findByCode(shortCode: string): Promise<ShortUrl | null>;
  findOwnedByCode(shortCode: string, userId: string): Promise<ShortUrl | null>;
  deleteOwnedByCode(shortCode: string, userId: string): Promise<boolean>;
  incrementClickCount(shortCode: string): Promise<ShortUrl>;
}
