import type { ShortCodeGenerator } from "./url.shortCodeGenerator.js";
import { OriginalUrlSchema, type ShortUrl } from "./url.domain.js";
import type { ShortUrlRepository } from "./url.repository.js";
import {
  InvalidExpirationError,
  InvalidShortUrlError,
  ShortCodeCollisionError,
  ShortCodeGenerationError,
  ShortUrlExpiredError,
  ShortUrlNotFoundError,
} from "./url.errors.js";

export const MAX_GENERATION_ATTEMPTS = 5;

export interface CreateShortUrlInput {
  url: string;
  expiresAt?: Date;
}

export function createUrlService(deps: {
  repo: ShortUrlRepository;
  generator: ShortCodeGenerator;
  now: () => Date;
  maxGenerationAttempts?: number;
}) {
  const { repo, generator, now } = deps;
  const maxGenerationAttempts = deps.maxGenerationAttempts ?? MAX_GENERATION_ATTEMPTS;

  function assertValidInput(input: CreateShortUrlInput, at: Date): void {
    if (!OriginalUrlSchema.safeParse(input.url).success) throw new InvalidShortUrlError();
    if (input.expiresAt !== undefined && input.expiresAt <= at) throw new InvalidExpirationError();
  }

  async function create(userId: string, input: CreateShortUrlInput): Promise<ShortUrl> {
    const createdAt = now();
    assertValidInput(input, createdAt);

    for (let attempt = 0; attempt < maxGenerationAttempts; attempt += 1) {
      const shortCode = generator.generate();
      if (await repo.existsByCode(shortCode)) continue;

      try {
        return await repo.create({
          shortCode,
          originalUrl: input.url,
          userId,
          createdAt,
          expiresAt: input.expiresAt ?? null,
        });
      } catch (error) {
        if (error instanceof ShortCodeCollisionError) continue;
        throw error;
      }
    }

    throw new ShortCodeGenerationError();
  }

  async function getForUser(userId: string, shortCode: string): Promise<ShortUrl> {
    const record = await repo.findOwnedByCode(shortCode, userId);
    if (!record) throw new ShortUrlNotFoundError();
    return record;
  }

  async function deleteForUser(userId: string, shortCode: string): Promise<void> {
    if (!(await repo.deleteOwnedByCode(shortCode, userId))) throw new ShortUrlNotFoundError();
  }

  async function resolve(shortCode: string): Promise<ShortUrl> {
    const record = await repo.findByCode(shortCode);
    if (!record || !record.active) throw new ShortUrlNotFoundError();
    if (record.expiresAt && record.expiresAt <= now()) throw new ShortUrlExpiredError();
    return repo.incrementClickCount(shortCode);
  }

  return { create, getForUser, deleteForUser, resolve };
}

export type UrlService = ReturnType<typeof createUrlService>;
