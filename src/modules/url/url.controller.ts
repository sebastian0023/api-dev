import type { RequestHandler } from "express";
import type { UrlService } from "./url.service.js";
import type { ShortUrl } from "./url.domain.js";
import type { CreateShortUrlBody, ShortCodeParam } from "./url.schemas.js";

function redirectUrl(publicUrl: string, shortCode: string): string {
  return `${publicUrl.replace(/\/$/, "")}/api/v1/urls/${shortCode}/redirect`;
}

function toResource(record: ShortUrl, publicUrl: string) {
  return {
    id: record.id,
    shortCode: record.shortCode,
    shortUrl: redirectUrl(publicUrl, record.shortCode),
    originalUrl: record.originalUrl,
    clickCount: record.clickCount,
    active: record.active,
    expiresAt: record.expiresAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export function createUrlController(service: UrlService, publicUrl: string) {
  const create: RequestHandler = async (req, res) => {
    const body = req.validated.body as CreateShortUrlBody;
    const record = await service.create(req.user!.id, body);
    res.ok(toResource(record, publicUrl), 201);
  };

  const getByCode: RequestHandler = async (req, res) => {
    const { shortCode } = req.validated.params as ShortCodeParam;
    const record = await service.getForUser(req.user!.id, shortCode);
    res.ok(toResource(record, publicUrl));
  };

  const deleteByCode: RequestHandler = async (req, res) => {
    const { shortCode } = req.validated.params as ShortCodeParam;
    await service.deleteForUser(req.user!.id, shortCode);
    res.status(204).send();
  };

  const redirect: RequestHandler = async (req, res) => {
    const { shortCode } = req.validated.params as ShortCodeParam;
    const record = await service.resolve(shortCode);
    res.redirect(302, record.originalUrl);
  };

  return { create, getByCode, deleteByCode, redirect };
}

export type UrlController = ReturnType<typeof createUrlController>;
